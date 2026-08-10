import { describe, expect, it } from "vitest";

import { parseRawHttpResponse } from "@/worker/transcript/http-response";

const encode = (value: string) => new TextEncoder().encode(value);

describe("proxy HTTP response parser", () => {
  it("parses a content-length response", () => {
    const response = parseRawHttpResponse(encode([
      "HTTP/1.1 200 OK",
      "Content-Type: application/json",
      "Content-Length: 11",
      "",
      "{\"ok\":true}",
    ].join("\r\n")));

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(response.body)).toBe("{\"ok\":true}");
  });

  it("decodes a chunked response body", () => {
    const response = parseRawHttpResponse(encode([
      "HTTP/1.1 200 OK",
      "Transfer-Encoding: chunked",
      "",
      "5",
      "Hello",
      "6",
      " world",
      "0",
      "",
      "",
    ].join("\r\n")));

    expect(new TextDecoder().decode(response.body)).toBe("Hello world");
  });
});
