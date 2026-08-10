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

  async get(input: string): Promise<Response> {
    return this.request(input, 0);
  }

  private async request(input: string, redirectCount: number): Promise<Response> {
    if (redirectCount > 3) throw new Error("代理请求重定向次数过多");
    const url = new URL(input);
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
    const request = [
      `GET ${path || "/"} HTTP/1.1`,
      `Host: ${url.host}`,
      "Accept: */*",
      "Accept-Encoding: identity",
      "Accept-Language: en-US,en;q=0.9,zh-CN;q=0.8",
      "User-Agent: Mozilla/5.0 (compatible; VideoArticle/1.0)",
      "Connection: close",
      "",
      "",
    ].join("\r\n");
    await writer.write(new TextEncoder().encode(request));
    writer.releaseLock();

    const raw = await readAll(secureSocket.readable as ReadableStream<Uint8Array>);
    await secureSocket.close();
    const parsed = parseRawHttpResponse(raw);
    const location = parsed.headers.get("location");
    if (location && parsed.status >= 300 && parsed.status < 400) {
      return this.request(new URL(location, url).toString(), redirectCount + 1);
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
