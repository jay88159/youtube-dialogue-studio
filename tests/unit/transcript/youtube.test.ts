import { describe, expect, it } from "vitest";

import type { HttpTransport } from "@/worker/transcript/types";
import {
  YouTubeTranscriptProvider,
  YouTubeVerificationError,
} from "@/worker/transcript/youtube";

class MemoryTransport implements HttpTransport {
  readonly requestedUrls: string[] = [];

  constructor(private readonly responses: Response[]) {}

  async get(url: string): Promise<Response> {
    this.requestedUrls.push(url);
    const response = this.responses.shift();
    if (!response) throw new Error("Unexpected request");
    return response;
  }
}

function watchPage(playerResponse: object): string {
  return `<html><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script></html>`;
}

describe("YouTubeTranscriptProvider", () => {
  it("selects a manual caption track and normalizes json3 events", async () => {
    const transport = new MemoryTransport([
      new Response(watchPage({
        playabilityStatus: { status: "OK" },
        videoDetails: { title: "AI Outlook" },
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              {
                baseUrl: "https://www.youtube.com/api/timedtext?v=video123456&lang=en&kind=asr",
                languageCode: "en",
                kind: "asr",
                name: { simpleText: "English auto-generated" },
              },
              {
                baseUrl: "https://www.youtube.com/api/timedtext?v=video123456&lang=en",
                languageCode: "en",
                name: { simpleText: "English" },
              },
            ],
          },
        },
      })),
      Response.json({
        events: [
          { tStartMs: 0, dDurationMs: 1200, segs: [{ utf8: "Hello " }, { utf8: "world" }] },
          { tStartMs: 1200, dDurationMs: 800, segs: [{ utf8: "\nNext point" }] },
          { tStartMs: 2000, dDurationMs: 500 },
        ],
      }),
    ]);

    const transcript = await new YouTubeTranscriptProvider().fetch(
      "video123456",
      transport,
    );

    expect(transcript).toEqual({
      videoId: "video123456",
      title: "AI Outlook",
      language: "en",
      segments: [
        { startMs: 0, durationMs: 1200, text: "Hello world" },
        { startMs: 1200, durationMs: 800, text: "Next point" },
      ],
    });
    expect(transport.requestedUrls[1]).toContain("fmt=json3");
    expect(transport.requestedUrls[1]).not.toContain("kind=asr");
  });

  it("reports the YouTube verification page as a stable domain error", async () => {
    const transport = new MemoryTransport([
      new Response(watchPage({
        playabilityStatus: {
          status: "LOGIN_REQUIRED",
          reason: "Sign in to confirm you’re not a bot",
        },
      })),
    ]);

    await expect(
      new YouTubeTranscriptProvider().fetch("video123456", transport),
    ).rejects.toBeInstanceOf(YouTubeVerificationError);
  });
});
