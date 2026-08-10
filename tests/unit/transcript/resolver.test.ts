import { describe, expect, it } from "vitest";

import type {
  HttpTransport,
  TranscriptDocument,
  TranscriptFixture,
  TranscriptProvider,
} from "@/worker/transcript/types";
import { TranscriptResolver } from "@/worker/transcript/resolver";
import { YouTubeVerificationError } from "@/worker/transcript/youtube";

const document: TranscriptDocument = {
  videoId: "xRh2sVcNXQ8",
  title: "Marc Andreessen 2026 Outlook",
  language: "en",
  segments: [{ startMs: 0, durationMs: 1000, text: "AI is still early." }],
};

const fixture: TranscriptFixture = {
  ...document,
  sourceNote: "内置演示字幕",
};

const directTransport = {} as HttpTransport;
const proxyTransport = {} as HttpTransport;

describe("TranscriptResolver", () => {
  it("returns a direct transcript without touching fallbacks", async () => {
    const provider: TranscriptProvider = {
      fetch: async (_videoId, transport) => {
        expect(transport).toBe(directTransport);
        return document;
      },
    };
    const resolver = new TranscriptResolver({
      provider,
      directTransport,
      proxyTransport,
      fixtures: new Map([[document.videoId, fixture]]),
    });

    await expect(resolver.resolve(document.videoId)).resolves.toEqual({
      source: "direct",
      transcript: document,
    });
  });

  it("uses the configured proxy after YouTube verification", async () => {
    const provider: TranscriptProvider = {
      fetch: async (_videoId, transport) => {
        if (transport === directTransport) throw new YouTubeVerificationError();
        expect(transport).toBe(proxyTransport);
        return document;
      },
    };
    const resolver = new TranscriptResolver({
      provider,
      directTransport,
      proxyTransport,
      fixtures: new Map(),
    });

    await expect(resolver.resolve(document.videoId)).resolves.toEqual({
      source: "proxy",
      transcript: document,
    });
  });

  it("uses the declared reference fixture when both live paths fail", async () => {
    const provider: TranscriptProvider = {
      fetch: async () => {
        throw new YouTubeVerificationError();
      },
    };
    const resolver = new TranscriptResolver({
      provider,
      directTransport,
      proxyTransport,
      fixtures: new Map([[document.videoId, fixture]]),
    });

    await expect(resolver.resolve(document.videoId)).resolves.toEqual({
      source: "fixture",
      transcript: fixture,
    });
  });

  it("does not invent a fixture for an unknown video", async () => {
    const provider: TranscriptProvider = {
      fetch: async () => {
        throw new YouTubeVerificationError();
      },
    };
    const resolver = new TranscriptResolver({
      provider,
      directTransport,
      fixtures: new Map(),
    });

    await expect(resolver.resolve("unknown12345")).rejects.toBeInstanceOf(
      YouTubeVerificationError,
    );
  });
});
