export interface RawHttpResponse {
  status: number;
  headers: Headers;
  body: Uint8Array;
}

const CR = 13;
const LF = 10;

export function buildConnectRequest(
  hostname: string,
  port: number,
  username: string,
  password: string,
): string {
  const authorization = btoa(`${username}:${password}`);
  return [
    `CONNECT ${hostname}:${port} HTTP/1.1`,
    `Host: ${hostname}:${port}`,
    `Proxy-Authorization: Basic ${authorization}`,
    "Proxy-Connection: keep-alive",
    "",
    "",
  ].join("\r\n");
}

function findSequence(bytes: Uint8Array, sequence: number[], from = 0): number {
  outer: for (let index = from; index <= bytes.length - sequence.length; index += 1) {
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (bytes[index + offset] !== sequence[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function decodeChunkedBody(body: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    const lineEnd = findSequence(body, [CR, LF], cursor);
    if (lineEnd < 0) throw new Error("代理响应包含不完整的 chunk 长度");

    const sizeLine = new TextDecoder().decode(body.slice(cursor, lineEnd));
    const size = Number.parseInt(sizeLine.split(";", 1)[0], 16);
    if (!Number.isFinite(size)) throw new Error("代理响应包含非法 chunk 长度");
    cursor = lineEnd + 2;

    if (size === 0) return concatChunks(chunks);
    if (cursor + size + 2 > body.length) throw new Error("代理响应 chunk 数据不完整");

    chunks.push(body.slice(cursor, cursor + size));
    cursor += size;
    if (body[cursor] !== CR || body[cursor + 1] !== LF) {
      throw new Error("代理响应 chunk 缺少结束符");
    }
    cursor += 2;
  }

  throw new Error("代理响应缺少结束 chunk");
}

export function parseRawHttpResponse(bytes: Uint8Array): RawHttpResponse {
  const headerEnd = findSequence(bytes, [CR, LF, CR, LF]);
  if (headerEnd < 0) throw new Error("代理响应缺少 HTTP 头结束符");

  const headerText = new TextDecoder().decode(bytes.slice(0, headerEnd));
  const [statusLine, ...headerLines] = headerText.split("\r\n");
  const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d{3})/.exec(statusLine);
  if (!statusMatch) throw new Error("代理响应状态行非法");

  const headers = new Headers();
  for (const line of headerLines) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }

  const rawBody = bytes.slice(headerEnd + 4);
  const body = headers.get("transfer-encoding")?.toLowerCase().includes("chunked")
    ? decodeChunkedBody(rawBody)
    : rawBody.slice(0, Number(headers.get("content-length")) || rawBody.length);

  return { status: Number(statusMatch[1]), headers, body };
}
