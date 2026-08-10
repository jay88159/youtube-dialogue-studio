import { describe, expect, it } from "vitest";

import { establishSocks5Tunnel } from "@/worker/transcript/socks5";

describe("SOCKS5 tunnel", () => {
  it("authenticates and opens a domain target when proxy replies are arbitrarily chunked", async () => {
    const proxyReplies = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Uint8Array.of(0x05));
        controller.enqueue(Uint8Array.of(0x02, 0x01, 0x00, 0x05, 0x00));
        controller.enqueue(Uint8Array.of(0x00, 0x01, 127, 0, 0, 1, 0x1f, 0x90));
        controller.close();
      },
    });
    const writes: number[][] = [];
    const proxyRequests = new WritableStream<Uint8Array>({
      write(chunk) {
        writes.push([...chunk]);
      },
    });

    await establishSocks5Tunnel(proxyReplies, proxyRequests, {
      hostname: "www.youtube.com",
      port: 443,
      username: "alice",
      password: "secret",
    });

    expect(writes).toEqual([
      [0x05, 0x01, 0x02],
      [0x01, 0x05, 97, 108, 105, 99, 101, 0x06, 115, 101, 99, 114, 101, 116],
      [
        0x05, 0x01, 0x00, 0x03, 0x0f,
        119, 119, 119, 46, 121, 111, 117, 116, 117, 98, 101, 46, 99, 111, 109,
        0x01, 0xbb,
      ],
    ]);
  });
});
