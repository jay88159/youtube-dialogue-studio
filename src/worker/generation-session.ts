import { DurableObject } from "cloudflare:workers";

import fixtureData from "../../fixtures/xRh2sVcNXQ8.json";
import { parseArticleSections } from "@/shared/article-sections";
import type {
  ArticleSection,
  ChapterDescriptor,
  GenerationEvent,
  TranscriptSource,
} from "@/shared/contracts";
import { encodeNdjson } from "@/shared/ndjson";

import type { AppEnv } from "./env";
import { apiError, AppError } from "./errors";
import { GeminiClient } from "./gemini/client";
import { FetchTransport } from "./transcript/fetch-transport";
import { TranscriptResolver } from "./transcript/resolver";
import { TcpProxyTransport } from "./transcript/tcp-proxy-transport";
import type {
  HttpTransport,
  TranscriptDocument,
  TranscriptFixture,
} from "./transcript/types";
import { YouTubeTranscriptProvider } from "./transcript/youtube";

type SessionStatus =
  | "created"
  | "transcript_ready"
  | "generating"
  | "completed"
  | "failed"
  | "cancelled";

interface SessionMeta {
  generationId: string;
  videoId: string;
  requirement?: string;
  status: SessionStatus;
  model: string;
  promptVersion: "article-v1";
  transcriptSource?: TranscriptSource;
  createdAt: number;
  expiresAt: number;
  errorCode?: string;
}

interface StartInput {
  generationId: string;
  videoId: string;
  requirement?: string;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TRANSCRIPT_BYTES = 500 * 1024;
const MAX_ARTICLE_BYTES = 160 * 1024;
const SUMMARY_CACHE_VERSION = "v2";
const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function transcriptText(transcript: TranscriptDocument): string {
  return transcript.segments.map((segment) => segment.text).join("\n");
}

export class GenerationSession extends DurableObject<AppEnv> {
  constructor(ctx: DurableObjectState, private readonly bindings: AppEnv) {
    super(ctx, bindings);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/start") {
      return this.start(request);
    }

    const summaryMatch = /^\/chapters\/(chapter-\d+)\/5w1h$/.exec(url.pathname);
    if (request.method === "POST" && summaryMatch) {
      return this.summarize(summaryMatch[1]);
    }

    return Response.json({ error: { code: "NOT_FOUND", message: "接口不存在", retryable: false } }, { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  private async start(request: Request): Promise<Response> {
    const existing = await this.ctx.storage.get<SessionMeta>("meta");
    if (existing) {
      return Response.json(
        { error: { code: "GENERATION_EXISTS", message: "本次生成已经启动", retryable: false } },
        { status: 409 },
      );
    }

    const input = await request.json<StartInput>();
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();
    this.ctx.waitUntil(this.runGeneration(input, writer));

    return new Response(stream.readable, {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-accel-buffering": "no",
      },
    });
  }

  private async runGeneration(
    input: StartInput,
    writer: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<void> {
    const now = Date.now();
    const model = this.bindings.GEMINI_MODEL || "gemini-3.5-flash";
    let meta: SessionMeta = {
      generationId: input.generationId,
      videoId: input.videoId,
      requirement: input.requirement,
      status: "created",
      model,
      promptVersion: "article-v1",
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    };

    try {
      if (!this.bindings.GEMINI_API_KEY) {
        throw new AppError("GEMINI_NOT_CONFIGURED", "服务端尚未配置 Gemini API Key", 503, false);
      }

      await this.ctx.storage.put("meta", meta);
      await this.ctx.storage.setAlarm(meta.expiresAt);
      await this.writeEvent(writer, {
        type: "generation.created",
        generationId: input.generationId,
      });

      const resolved = await this.createTranscriptResolver().resolve(input.videoId);
      if (byteLength(transcriptText(resolved.transcript)) > MAX_TRANSCRIPT_BYTES) {
        throw new AppError("TRANSCRIPT_TOO_LARGE", "字幕超过 500 KiB 限制", 413, false);
      }

      meta = {
        ...meta,
        status: "transcript_ready",
        transcriptSource: resolved.source,
      };
      await this.ctx.storage.put("transcript", resolved.transcript);
      await this.ctx.storage.put("meta", meta);
      await this.writeEvent(writer, {
        type: "transcript.ready",
        source: resolved.source,
        segmentCount: resolved.transcript.segments.length,
      });

      meta = { ...meta, status: "generating" };
      await this.ctx.storage.put("meta", meta);
      const gemini = new GeminiClient({
        apiKey: this.bindings.GEMINI_API_KEY,
        model,
      });
      let article = "";
      let articleBytes = 0;
      for await (const delta of gemini.streamArticle({
        transcript: resolved.transcript,
        requirement: input.requirement,
      })) {
        articleBytes += byteLength(delta);
        if (articleBytes > MAX_ARTICLE_BYTES) {
          throw new AppError("ARTICLE_TOO_LARGE", "生成文章超过 160 KiB 限制", 502, false);
        }
        article += delta;
        await this.writeEvent(writer, { type: "article.delta", text: delta });
      }

      const chapters = parseArticleSections(article);
      if (chapters.length === 0) {
        throw new AppError("EMPTY_ARTICLE", "Gemini 没有生成可用文章", 502, true);
      }

      meta = { ...meta, status: "completed" };
      await this.ctx.storage.put("article", article);
      await this.ctx.storage.put("chapters", chapters);
      await this.ctx.storage.put("meta", meta);
      await this.writeEvent(writer, {
        type: "article.completed",
        chapters: chapters.map(({ id, title }) => ({ id, title })),
      });
    } catch (error) {
      const normalized = apiError(error);
      meta = { ...meta, status: "failed", errorCode: normalized.error.code };
      await this.ctx.storage.put("meta", meta);
      try {
        await this.writeEvent(writer, { type: "generation.failed", error: normalized.error });
      } catch {
        meta = { ...meta, status: "cancelled" };
        await this.ctx.storage.put("meta", meta);
      }
    } finally {
      try {
        await writer.close();
      } catch {
        // The browser may have cancelled the stream.
      }
    }
  }

  private async summarize(chapterId: string): Promise<Response> {
    try {
      const cacheKey = `summary:${SUMMARY_CACHE_VERSION}:${chapterId}`;
      const cached = await this.ctx.storage.get(cacheKey);
      if (cached) return Response.json(cached);

      const [meta, transcript, chapters] = await Promise.all([
        this.ctx.storage.get<SessionMeta>("meta"),
        this.ctx.storage.get<TranscriptDocument>("transcript"),
        this.ctx.storage.get<ArticleSection[]>("chapters"),
      ]);

      if (!meta || meta.status !== "completed" || !transcript || !chapters) {
        throw new AppError("GENERATION_NOT_READY", "文章尚未生成完成", 409, true);
      }
      if (!this.bindings.GEMINI_API_KEY) {
        throw new AppError("GEMINI_NOT_CONFIGURED", "服务端尚未配置 Gemini API Key", 503, false);
      }

      const chapter = chapters.find((candidate) => candidate.id === chapterId);
      if (!chapter) throw new AppError("CHAPTER_NOT_FOUND", "章节不存在", 404, false);

      const summary = await new GeminiClient({
        apiKey: this.bindings.GEMINI_API_KEY,
        model: meta.model,
      }).summarizeChapter({
        transcript,
        articleOutline: chapters.map((candidate) => candidate.title),
        chapterTitle: chapter.title,
        chapterMarkdown: chapter.markdown,
      });
      await this.ctx.storage.put(cacheKey, summary);
      return Response.json(summary, { headers: { "cache-control": "private, max-age=86400" } });
    } catch (error) {
      const normalized = apiError(error);
      return Response.json({ error: normalized.error }, { status: normalized.status });
    }
  }

  private createTranscriptResolver(): TranscriptResolver {
    let proxyTransport: HttpTransport | undefined;
    const apiKey = this.bindings.GEMINI_API_KEY;
    const gemini = apiKey
      ? new GeminiClient({
          apiKey,
          model: this.bindings.GEMINI_MODEL || "gemini-3.5-flash",
        })
      : undefined;
    const {
      WEBSHARE_PROXY_HOST: hostname,
      WEBSHARE_PROXY_PORT: port,
      WEBSHARE_PROXY_USERNAME: username,
      WEBSHARE_PROXY_PASSWORD: password,
    } = this.bindings;
    if (hostname && port && username && password) {
      proxyTransport = new TcpProxyTransport({
        hostname,
        port: Number(port),
        username,
        password,
      });
    }

    const fixture = fixtureData as TranscriptFixture;
    return new TranscriptResolver({
      provider: new YouTubeTranscriptProvider(),
      directTransport: new FetchTransport(),
      proxyTransport,
      fixtures: new Map([[fixture.videoId, fixture]]),
      videoFallback: gemini
        ? { fetch: (videoId) => gemini.extractVideoTranscript(videoId) }
        : undefined,
    });
  }

  private writeEvent(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    event: GenerationEvent,
  ): Promise<void> {
    return writer.write(encoder.encode(encodeNdjson(event)));
  }
}

export type { ChapterDescriptor };
