import { describe, expect, it } from "vitest";

import { GeminiClient, GeminiResponseError } from "@/worker/gemini/client";
import type { TranscriptDocument } from "@/worker/transcript/types";

const transcript: TranscriptDocument = {
  videoId: "xRh2sVcNXQ8",
  title: "AI Outlook",
  language: "en",
  segments: [{ startMs: 0, durationMs: 1000, text: "AI is early." }],
};

describe("GeminiClient", () => {
  it("extracts a structured transcript from a public YouTube video URL", async () => {
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

    const body = await request!.json() as {
      contents: Array<{ parts: Array<{ fileData?: { fileUri?: string } }> }>;
    };
    expect(body.contents[0].parts[0].fileData?.fileUri)
      .toBe("https://www.youtube.com/watch?v=9hE5-98ZeCg");
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
