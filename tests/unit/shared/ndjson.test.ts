import { describe, expect, it } from "vitest";

import type { GenerationEvent } from "@/shared/contracts";
import { decodeNdjson, encodeNdjson, NdjsonParseError } from "@/shared/ndjson";

function streamChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("NDJSON protocol", () => {
  it("decodes events when JSON lines cross network chunk boundaries", async () => {
    const events: GenerationEvent[] = [
      { type: "generation.created", generationId: "generation-1" },
      { type: "article.delta", text: "第一段" },
      { type: "article.completed", chapters: [{ id: "chapter-1", title: "开场" }] },
    ];
    const payload = events.map(encodeNdjson).join("").trimEnd();
    const chunks = [payload.slice(0, 9), payload.slice(9, 37), payload.slice(37)];

    const decoded: GenerationEvent[] = [];
    for await (const event of decodeNdjson(streamChunks(chunks))) decoded.push(event);

    expect(decoded).toEqual(events);
  });

  it("rejects a malformed line instead of dropping it", async () => {
    const consume = async () => {
      for await (const event of decodeNdjson(streamChunks(["{broken}\n"]))) {
        void event;
      }
    };

    await expect(consume()).rejects.toBeInstanceOf(NdjsonParseError);
  });
});
