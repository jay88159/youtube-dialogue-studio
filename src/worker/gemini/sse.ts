interface GeminiStreamPayload {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
}

function parseEvent(block: string): string[] | null {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();

  if (!data || data === "[DONE]") return null;

  let payload: GeminiStreamPayload;
  try {
    payload = JSON.parse(data) as GeminiStreamPayload;
  } catch (error) {
    throw new Error("Gemini 流包含非法 JSON", { cause: error });
  }

  if (payload.error) throw new Error(payload.error.message || "Gemini 流返回错误");

  return (payload.candidates ?? []).flatMap((candidate) =>
    (candidate.content?.parts ?? [])
      .map((part) => part.text)
      .filter((text): text is string => Boolean(text)),
  );
}

export async function* parseGeminiSse(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = /\r?\n\r?\n/.exec(buffer);
      while (boundary?.index !== undefined) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        for (const text of parseEvent(block) ?? []) yield text;
        boundary = /\r?\n\r?\n/.exec(buffer);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      for (const text of parseEvent(buffer) ?? []) yield text;
    }
  } finally {
    reader.releaseLock();
  }
}
