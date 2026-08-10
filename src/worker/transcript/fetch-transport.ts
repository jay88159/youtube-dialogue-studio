import type { HttpTransport } from "./types";

export class FetchTransport implements HttpTransport {
  async get(url: string): Promise<Response> {
    return fetch(url, {
      headers: {
        "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8",
        "user-agent": "Mozilla/5.0 (compatible; VideoArticle/1.0)",
      },
      redirect: "follow",
    });
  }
}
