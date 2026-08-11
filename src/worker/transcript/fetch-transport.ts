import type { HttpTransport } from "./types";

export class FetchTransport implements HttpTransport {
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    const headers = new Headers(request.headers);
    if (!headers.has("accept-language")) {
      headers.set("accept-language", "en-US,en;q=0.9,zh-CN;q=0.8");
    }
    if (!headers.has("user-agent")) {
      headers.set("user-agent", "Mozilla/5.0 (compatible; VideoArticle/1.0)");
    }

    return fetch(new Request(request, { headers, redirect: "follow" }));
  }
}
