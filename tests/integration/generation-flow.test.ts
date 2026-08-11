import { createTestHarness } from "wrangler";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { GenerationEvent } from "@/shared/contracts";
import { decodeNdjson } from "@/shared/ndjson";

const videoId = "xRh2sVcNXQ8";
const server = createTestHarness({
  workers: [{
    configPath: "./wrangler.integration.jsonc",
    secrets: { GEMINI_API_KEY: "integration-test-key" },
    vars: { GEMINI_MODEL: "gemini-test" },
  }],
});

function watchPage(): string {
  return `<script>var ytInitialPlayerResponse = ${JSON.stringify({
    playabilityStatus: { status: "OK" },
    videoDetails: { title: "AI Outlook" },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [{
          baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`,
          languageCode: "en",
          name: { simpleText: "English" },
        }],
      },
    },
  })};</script>`;
}

function geminiStream(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach((text, index) => setTimeout(() => {
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`,
        ));
        if (index === chunks.length - 1) controller.close();
      }, index * 20));
    },
  }), { headers: { "content-type": "text/event-stream" } });
}

function mockExternalRequests(summaryRequests: string[], articleRequests: string[]): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);

    if (url.origin === "https://youtubei.googleapis.com" && url.pathname === "/youtubei/v1/player") {
      return Response.json({
        playabilityStatus: { status: "OK" },
        videoDetails: { title: "AI Outlook", shortDescription: "AI interview" },
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [{
              baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`,
              languageCode: "en",
              vssId: ".en",
            }],
          },
        },
      });
    }
    if (url.origin === "https://www.youtube.com" && url.pathname === "/watch") {
      return new Response(watchPage(), { headers: { "content-type": "text/html" } });
    }
    if (url.origin === "https://www.youtube.com" && url.pathname === "/api/timedtext") {
      return Response.json({
        events: [
          { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "AI revenue is growing." }] },
          { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: "Unit costs are falling." }] },
        ],
      });
    }
    if (url.pathname.endsWith(":streamGenerateContent")) {
      articleRequests.push(await request.text());
      return articleRequests.length === 1
        ? geminiStream(["# AI 对话\n\n## 智能经济\n\n**Mark：** 收入增长。"])
        : geminiStream(["## 成本曲线\n\n**主持人：** 成本如何下降？"]);
    }
    if (url.pathname.endsWith(":generateContent")) {
      summaryRequests.push(await request.text());
      return Response.json({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                who: "Mark",
                what: "AI 收入增长",
                when: "商业化早期",
                where: "消费者和企业市场",
                why: "产品快速分发",
                how: "订阅和按量计费",
              }),
            }],
          },
        }],
      });
    }

    throw new Error(`Unexpected external request: ${request.method} ${request.url}`);
  });
}

beforeAll(async () => {
  await server.listen();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await server.reset();
});

afterAll(async () => {
  await server.close();
});

describe("generation flow", () => {
  it("streams deltas, persists context, and summarizes with an empty client body", async () => {
    const summaryRequests: string[] = [];
    const articleRequests: string[] = [];
    mockExternalRequests(summaryRequests, articleRequests);

    const response = await server.fetch("/api/generations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        requirement: "面向产品经理",
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");

    const events: GenerationEvent[] = [];
    for await (const event of decodeNdjson(response.body!)) events.push(event);
    expect(events.slice(0, 2).map((event) => event.type)).toEqual([
      "generation.created",
      "transcript.ready",
    ]);
    expect(events.at(-1)?.type).toBe("article.completed");
    const articleDeltas = events.filter((event) => event.type === "article.delta");
    expect(articleDeltas.length).toBeGreaterThanOrEqual(2);
    expect(articleDeltas.map((event) => event.text).join(""))
      .toContain("## 成本曲线");
    expect(articleRequests).toHaveLength(2);
    expect(articleRequests[0]).toContain("AI revenue is growing.");
    expect(articleRequests[0]).not.toContain("Unit costs are falling.");
    expect(articleRequests[1]).toContain("Unit costs are falling.");
    expect(articleRequests[1]).toContain("## 智能经济");

    const generationId = (events[0] as Extract<GenerationEvent, { type: "generation.created" }>).generationId;
    const summary = await server.fetch(
      `/api/generations/${generationId}/chapters/chapter-1/5w1h`,
      { method: "POST" },
    );

    expect(summary.status).toBe(200);
    expect(await summary.json()).toEqual({
      who: "Mark",
      what: "AI 收入增长",
      when: "商业化早期",
      where: "消费者和企业市场",
      why: "产品快速分发",
      how: "订阅和按量计费",
    });
    expect(summaryRequests).toHaveLength(1);
    expect(summaryRequests[0]).toContain("AI revenue is growing.");
    expect(summaryRequests[0]).toContain("## 智能经济");
  });

  it("rejects a non-YouTube URL before making external requests", async () => {
    const externalFetch = vi.spyOn(globalThis, "fetch");
    const response = await server.fetch("/api/generations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/video" }),
    });

    expect(response.status).toBe(400);
    expect(externalFetch).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_YOUTUBE_URL", retryable: false },
    });
  });
});
