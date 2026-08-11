import { connect } from "cloudflare:sockets";

import { parseRawHttpResponse } from "./http-response";
import { establishSocks5Tunnel } from "./socks5";
import type { HttpTransport } from "./types";

interface ProxyConfiguration {
  hostname: string;
  port: number;
  username: string;
  password: string;
}

const MAX_PROXY_RESPONSE_BYTES = 2 * 1024 * 1024;

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_PROXY_RESPONSE_BYTES) throw new Error("代理响应超过 2 MiB 限制");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export class TcpProxyTransport implements HttpTransport {
  constructor(private readonly proxy: ProxyConfiguration) {}

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    const body = request.method === "GET" || request.method === "HEAD"
      ? new Uint8Array()
      : new Uint8Array(await request.arrayBuffer());
    return this.request(
      new URL(request.url),
      request.method,
      request.headers,
      body,
      0,
    );
  }

  private async request(
    url: URL,
    method: string,
    inputHeaders: Headers,
    body: Uint8Array,
    redirectCount: number,
  ): Promise<Response> {
    if (redirectCount > 3) throw new Error("代理请求重定向次数过多");
    if (url.protocol !== "https:") throw new Error("代理传输只允许 HTTPS");

    const socket = connect(
      { hostname: this.proxy.hostname, port: this.proxy.port },
      { secureTransport: "starttls", allowHalfOpen: true },
    );
    await socket.opened;

    try {
      await establishSocks5Tunnel(
        socket.readable as ReadableStream<Uint8Array>,
        socket.writable as WritableStream<Uint8Array>,
        {
          hostname: url.hostname,
          port: 443,
          username: this.proxy.username,
          password: this.proxy.password,
        },
      );
    } catch (error) {
      await socket.close();
      throw error;
    }

    const secureSocket = socket.startTls({ expectedServerHostname: url.hostname });
    await secureSocket.opened;
    const writer = secureSocket.writable.getWriter();
    const path = `${url.pathname}${url.search}`;
    const headers = new Headers(inputHeaders);
    headers.delete("host");
    headers.delete("connection");
    headers.set("accept-encoding", "identity");
    headers.set("connection", "close");
    if (!headers.has("accept")) headers.set("accept", "*/*");
    if (!headers.has("accept-language")) headers.set("accept-language", "en-US,en;q=0.9,zh-CN;q=0.8");
    if (!headers.has("user-agent")) headers.set("user-agent", "Mozilla/5.0 (compatible; VideoArticle/1.0)");
    if (body.length > 0 || method === "POST") headers.set("content-length", String(body.length));

    const requestHead = [
      `${method} ${path || "/"} HTTP/1.1`,
      `Host: ${url.host}`,
      ...[...headers].map(([name, value]) => `${name}: ${value}`),
      "",
      "",
    ].join("\r\n");
    await writer.write(new TextEncoder().encode(requestHead));
    if (body.length > 0) await writer.write(body);
    writer.releaseLock();

    const raw = await readAll(secureSocket.readable as ReadableStream<Uint8Array>);
    await secureSocket.close();
    const parsed = parseRawHttpResponse(raw);
    const location = parsed.headers.get("location");
    if (location && parsed.status >= 300 && parsed.status < 400) {
      const switchToGet = parsed.status === 303
        || ((parsed.status === 301 || parsed.status === 302) && method === "POST");
      const nextHeaders = new Headers(inputHeaders);
      if (switchToGet) {
        nextHeaders.delete("content-length");
        nextHeaders.delete("content-type");
      }
      return this.request(
        new URL(location, url),
        switchToGet ? "GET" : method,
        nextHeaders,
        switchToGet ? new Uint8Array() : body,
        redirectCount + 1,
      );
    }

    parsed.headers.delete("content-length");
    parsed.headers.delete("transfer-encoding");
    const responseBody = new Uint8Array(parsed.body.byteLength);
    responseBody.set(parsed.body);
    return new Response(responseBody.buffer, {
      status: parsed.status,
      headers: parsed.headers,
    });
  }
}
