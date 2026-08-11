import { describe, expect, it } from "vitest";

import { GeminiClient, GeminiResponseError } from "@/worker/gemini/client";
import type { TranscriptDocument } from "@/worker/transcript/types";

const transcript: TranscriptDocument = {
  videoId: "xRh2sVcNXQ8",
  title: "AI Outlook",
  language: "en",
  segments: [{ startMs: 0, durationMs: 1000, text: "AI is early." }],
};

interface VideoContentMapRequest {
  contents: Array<{ parts: Array<{ fileData?: { fileUri?: string }; text?: string }> }>;
  generationConfig: {
    responseFormat: {
      text: {
        schema: {
          properties: {
            segments: {
              maxItems?: number;
              description?: string;
              items: { properties: { text: { maxLength?: number } } };
            };
          };
        };
      };
    };
  };
}

describe("GeminiClient", () => {
  it("extracts a bounded content map from a public YouTube video URL", async () => {
    let request: Request | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      request = new Request(input, init);
      return Response.json({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                title: "Public demo",
                language: "en",
                segments: [
                  { startMs: 0, durationMs: 2400, text: "The demo begins." },
                  { startMs: 2400, durationMs: 3100, text: "A second point follows." },
                ],
              }),
            }],
          },
        }],
      });
    };
    const client = new GeminiClient({ apiKey: "test-key", model: "gemini-test", fetcher });

    await expect(client.extractVideoTranscript("9hE5-98ZeCg")).resolves.toEqual({
      videoId: "9hE5-98ZeCg",
      title: "Public demo",
      language: "en",
      segments: [
        { startMs: 0, durationMs: 2400, text: "The demo begins." },
        { startMs: 2400, durationMs: 3100, text: "A second point follows." },
      ],
    });

    const body = await request!.json() as VideoContentMapRequest;
    expect(body.contents[0].parts[0].fileData?.fileUri)
      .toBe("https://www.youtube.com/watch?v=9hE5-98ZeCg");
    expect(body.generationConfig.responseFormat.text.schema.properties.segments.maxItems)
      .toBeUndefined();
    expect(body.generationConfig.responseFormat.text.schema.properties.segments.description)
      .toContain("最多 96 个");
    expect(body.generationConfig.responseFormat.text.schema.properties.segments.items.properties.text.maxLength)
      .toBe(240);
    expect(body.contents[0].parts[1].text).toContain("不超过 96 个");
  });

  it("retries with a smaller content map when a long-video response is truncated", async () => {
    const requests: Request[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init));
      if (requests.length === 1) {
        return Response.json({
          candidates: [{
            finishReason: "MAX_TOKENS",
            content: { parts: [{ text: '{"title":"Long video","segments":[{"text":"unterminated' }] },
          }],
        });
      }
      return Response.json({
        candidates: [{
          finishReason: "STOP",
          content: {
            parts: [{
              text: JSON.stringify({
                title: "Long video",
                language: "en",
                segments: [{ startMs: 0, durationMs: 60_000, text: "Condensed opening." }],
              }),
            }],
          },
        }],
      });
    };
    const client = new GeminiClient({ apiKey: "test-key", model: "gemini-test", fetcher });

    await expect(client.extractVideoTranscript("longVideo1")).resolves.toMatchObject({
      videoId: "longVideo1",
      segments: [{ text: "Condensed opening." }],
    });

    expect(requests).toHaveLength(2);
    const retryBody = await requests[1].json() as VideoContentMapRequest;
    expect(retryBody.generationConfig.responseFormat.text.schema.properties.segments.maxItems)
      .toBeUndefined();
    expect(retryBody.generationConfig.responseFormat.text.schema.properties.segments.items.properties.text.maxLength)
      .toBe(180);
    expect(retryBody.contents[0].parts[1].text).toContain("不超过 48 个");
  });

  it("bounds overlong segments returned by the compact retry", async () => {
    let attempts = 0;
    const fetcher: typeof fetch = async () => {
      attempts += 1;
      if (attempts === 1) {
        return Response.json({
          candidates: [{
            finishReason: "MAX_TOKENS",
            content: { parts: [{ text: '{"title":"Long video"' }] },
          }],
        });
      }

      return Response.json({
        candidates: [{
          finishReason: "STOP",
          content: {
            parts: [{
              text: JSON.stringify({
                title: "Long video",
                language: "zh-CN",
                segments: [
                  { startMs: 0, durationMs: 60_000, text: "开".repeat(220) },
                  { startMs: 60_000, durationMs: 60_000, text: "尾".repeat(220) },
                ],
              }),
            }],
          },
        }],
      });
    };
    const client = new GeminiClient({ apiKey: "test-key", model: "gemini-test", fetcher });

    const result = await client.extractVideoTranscript("longVideo2");

    expect(attempts).toBe(2);
    expect(result.segments).toHaveLength(2);
    expect(result.segments.every((segment) => segment.text.length <= 180)).toBe(true);
    expect(result.segments[0]).toMatchObject({ startMs: 0, durationMs: 60_000 });
    expect(result.segments[1]).toMatchObject({ startMs: 60_000, durationMs: 60_000 });
    expect(result.segments[0].text.endsWith("…")).toBe(true);
    expect(result.segments[1].text.endsWith("…")).toBe(true);
  });

  it("streams article deltas from the Gemini SSE endpoint", async () => {
    const requests: Request[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init));
      return new Response(
        'data: {"candidates":[{"content":{"parts":[{"text":"# 标题"}]}}]}\n\n'
        + 'data: {"candidates":[{"content":{"parts":[{"text":"\\n\\n正文"}]}}]}\n\n',
        { headers: { "content-type": "text/event-stream" } },
      );
    };
    const client = new GeminiClient({ apiKey: "test-key", model: "gemini-test", fetcher });

    const output: string[] = [];
    for await (const delta of client.streamArticle({ transcript })) output.push(delta);

    expect(output).toEqual(["# 标题", "\n\n正文"]);
    expect(requests[0].url).toContain("models/gemini-test:streamGenerateContent?alt=sse");
    expect(requests[0].headers.get("x-goog-api-key")).toBe("test-key");
  });

  it("validates the structured 5W1H response", async () => {
    const fetcher: typeof fetch = async () => Response.json({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              who: "Mark",
              what: "AI 商业模式",
              when: "当前商业化早期",
              where: "消费者和企业市场",
              why: "智能成本下降",
              how: "订阅和按量计费",
            }),
          }],
        },
      }],
    });
    const client = new GeminiClient({ apiKey: "test-key", model: "gemini-test", fetcher });

    await expect(client.summarizeChapter({
      transcript,
      articleOutline: ["智能经济"],
      chapterTitle: "智能经济",
      chapterMarkdown: "## 智能经济\n\n正文",
    })).resolves.toEqual({
      who: "Mark",
      what: "AI 商业模式",
      when: "当前商业化早期",
      where: "消费者和企业市场",
      why: "智能成本下降",
      how: "订阅和按量计费",
    });
  });

  it("maps an exhausted free quota to a retryable response error", async () => {
    const fetcher: typeof fetch = async () => Response.json(
      { error: { message: "Resource exhausted" } },
      { status: 429 },
    );
    const client = new GeminiClient({ apiKey: "test-key", model: "gemini-test", fetcher });

    const consume = async () => {
      for await (const delta of client.streamArticle({ transcript })) void delta;
    };
    const error = await consume().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GeminiResponseError);
    expect(error).toMatchObject({ status: 429, retryable: true });
  });
});
