import type { GenerationEvent } from "./contracts";

export class NdjsonParseError extends Error {
  constructor(line: string, options?: ErrorOptions) {
    super(`无法解析流式事件：${line.slice(0, 80)}`, options);
    this.name = "NdjsonParseError";
  }
}

export function encodeNdjson(event: GenerationEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function parseLine(line: string): GenerationEvent {
  try {
    return JSON.parse(line) as GenerationEvent;
  } catch (error) {
    throw new NdjsonParseError(line, { cause: error });
  }
}

export async function* decodeNdjson(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<GenerationEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim()) yield parseLine(line);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) yield parseLine(buffer);
  } finally {
    reader.releaseLock();
  }
}
