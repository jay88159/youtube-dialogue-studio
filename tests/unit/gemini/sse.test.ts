import { describe, expect, it } from "vitest";

import { parseGeminiSse } from "@/worker/gemini/sse";

function streamChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("parseGeminiSse", () => {
  it("yields text parts across arbitrary network chunks", async () => {
    const payload = [
      'data: {"candidates":[{"content":{"parts":[{"text":"第一段"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"，继续。"}]}}]}\n\n',
      "data: [DONE]\n\n",
    ].join("");
    const split = [payload.slice(0, 7), payload.slice(7, 64), payload.slice(64)];

    const output: string[] = [];
    for await (const text of parseGeminiSse(streamChunks(split))) output.push(text);

    expect(output).toEqual(["第一段", "，继续。"]);
  });

  it("rejects malformed data events", async () => {
    const consume = async () => {
      for await (const text of parseGeminiSse(streamChunks(["data: {broken}\n\n"]))) {
        void text;
      }
    };

    await expect(consume()).rejects.toThrow("Gemini 流包含非法 JSON");
  });
});
