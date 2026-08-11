import { describe, expect, it } from "vitest";

import type { HttpTransport } from "@/worker/transcript/types";
import {
  YouTubeTranscriptProvider,
  YouTubeVerificationError,
} from "@/worker/transcript/youtube";

class MemoryTransport implements HttpTransport {
  readonly requests: Request[] = [];

  constructor(private readonly handler: (request: Request) => Response) {}

  async get(url: string): Promise<Response> {
    return this.fetch(url);
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init);
    this.requests.push(request);
    return this.handler(request);
  }
}

function watchPage(playerResponse: object): string {
  return `<html><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script></html>`;
}

describe("YouTubeTranscriptProvider", () => {
  it("selects a manual caption track and normalizes json3 events", async () => {
    const player = {
      playabilityStatus: { status: "OK" },
      videoDetails: { title: "AI Outlook" },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: "https://www.youtube.com/api/timedtext?v=video123456&lang=en&kind=asr",
              languageCode: "en",
              vssId: "a.en",
              kind: "asr",
              name: { simpleText: "English auto-generated" },
            },
            {
              baseUrl: "https://www.youtube.com/api/timedtext?v=video123456&lang=en",
              languageCode: "en",
              vssId: ".en",
              name: { simpleText: "English" },
            },
          ],
        },
      },
    };
    const transport = new MemoryTransport((request) => {
      if (request.url.includes("youtubei/v1/player")) return Response.json(player);
      if (request.url.includes("/api/timedtext")) {
        return Response.json({
          events: [
            { tStartMs: 0, dDurationMs: 1200, segs: [{ utf8: "Hello " }, { utf8: "world" }] },
            { tStartMs: 1200, dDurationMs: 800, segs: [{ utf8: "\nNext point" }] },
            { tStartMs: 2000, dDurationMs: 500 },
          ],
        });
      }
      if (request.url.includes("/watch")) {
        return new Response(watchPage({
          ...player,
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [...player.captions.playerCaptionsTracklistRenderer.captionTracks].reverse(),
            },
          },
        }));
      }
      throw new Error(`Unexpected request: ${request.method} ${request.url}`);
    });

    const transcript = await new YouTubeTranscriptProvider().fetch(
      "video123456",
      transport,
    );

    expect(transcript).toEqual({
      videoId: "video123456",
      title: "AI Outlook",
      language: "und",
      segments: [
        { startMs: 0, durationMs: 1200, text: "Hello world" },
        { startMs: 1200, durationMs: 800, text: "Next point" },
      ],
    });
    expect(transport.requests[0].method).toBe("POST");
    expect(transport.requests[0].url).toContain("youtubei.googleapis.com/youtubei/v1/player");
    expect(transport.requests[1].url).toContain("fmt=json3");
    expect(transport.requests[1].url).not.toContain("kind=asr");
  });

  it("reports the YouTube verification page as a stable domain error", async () => {
    const verification = {
        playabilityStatus: {
          status: "LOGIN_REQUIRED",
          reason: "Sign in to confirm you’re not a bot",
        },
      };
    const transport = new MemoryTransport((request) => request.url.includes("youtubei/v1/player")
      ? Response.json(verification)
      : new Response(watchPage(verification)));

    await expect(
      new YouTubeTranscriptProvider().fetch("video123456", transport),
    ).rejects.toBeInstanceOf(YouTubeVerificationError);
  });
});
