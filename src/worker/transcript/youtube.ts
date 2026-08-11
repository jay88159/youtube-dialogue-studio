import {
  getSubtitles,
  getVideoDetails,
  type Options,
  type Subtitle,
} from "youtube-caption-extractor";

import type {
  HttpTransport,
  TranscriptDocument,
  TranscriptProvider,
  TranscriptSegment,
} from "./types";

export class YouTubeVerificationError extends Error {
  constructor() {
    super("YouTube 要求验证访问者身份");
    this.name = "YouTubeVerificationError";
  }
}

export class CaptionsNotFoundError extends Error {
  constructor() {
    super("该视频没有可用字幕");
    this.name = "CaptionsNotFoundError";
  }
}

function isVerificationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /LOGIN_REQUIRED|confirm you(?:'|’)?re not a bot|captcha|too many requests|\b(?:403|429)\b/i
    .test(message);
}

function normalizeSubtitle(subtitle: Subtitle): TranscriptSegment | null {
  const startMs = Math.round(Number(subtitle.start) * 1000);
  const durationMs = Math.round(Number(subtitle.dur) * 1000);
  const text = subtitle.text.trim();
  if (!Number.isFinite(startMs) || !Number.isFinite(durationMs) || !text) return null;

  return {
    startMs: Math.max(0, startMs),
    durationMs: Math.max(1, durationMs),
    text,
  };
}

function transportFetch(transport: HttpTransport): typeof fetch {
  return (input, init) => transport.fetch(input, init);
}

export class YouTubeTranscriptProvider implements TranscriptProvider {
  async fetch(videoId: string, transport: HttpTransport): Promise<TranscriptDocument> {
    const options: Options = {
      videoID: videoId,
      lang: "en",
      fetch: transportFetch(transport),
    };

    try {
      const details = await getVideoDetails(options);
      const subtitles = details.subtitles.length > 0
        ? details.subtitles
        : await getSubtitles(options);
      const segments = subtitles
        .map(normalizeSubtitle)
        .filter((segment): segment is TranscriptSegment => segment !== null);
      if (segments.length === 0) throw new CaptionsNotFoundError();

      return {
        videoId,
        title: details.title.trim() || `YouTube ${videoId}`,
        language: "und",
        segments,
      };
    } catch (error) {
      if (error instanceof CaptionsNotFoundError) throw error;
      if (isVerificationError(error)) throw new YouTubeVerificationError();
      throw error;
    }
  }
}
