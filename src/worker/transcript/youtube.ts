import { normalizeJson3Transcript } from "./normalizer";
import type {
  HttpTransport,
  TranscriptDocument,
  TranscriptProvider,
} from "./types";

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: { simpleText?: string };
}

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { title?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
}

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

function findJsonObject(source: string, start: number): string | null {
  const objectStart = source.indexOf("{", start);
  if (objectStart < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(objectStart, index + 1);
    }
  }

  return null;
}

function parsePlayerResponse(html: string): PlayerResponse {
  const marker = "ytInitialPlayerResponse";
  const markerIndex = html.indexOf(marker);
  const json = markerIndex >= 0 ? findJsonObject(html, markerIndex + marker.length) : null;
  if (!json) throw new Error("YouTube 页面缺少播放器数据");
  return JSON.parse(json) as PlayerResponse;
}

function trackScore(track: CaptionTrack): number {
  const language = track.languageCode.toLowerCase();
  const manualScore = track.kind === "asr" ? 0 : 100;
  const languageScore = language.startsWith("zh") ? 30 : language.startsWith("en") ? 20 : 0;
  return manualScore + languageScore;
}

function chooseCaptionTrack(tracks: CaptionTrack[]): CaptionTrack {
  const track = [...tracks].sort((left, right) => trackScore(right) - trackScore(left))[0];
  if (!track) throw new CaptionsNotFoundError();
  return track;
}

function isVerificationRequired(response: PlayerResponse, html: string): boolean {
  const reason = response.playabilityStatus?.reason ?? "";
  return response.playabilityStatus?.status === "LOGIN_REQUIRED"
    || /confirm you(?:'|’)?re not a bot/i.test(reason)
    || /confirm you(?:'|’)?re not a bot/i.test(html);
}

export class YouTubeTranscriptProvider implements TranscriptProvider {
  async fetch(videoId: string, transport: HttpTransport): Promise<TranscriptDocument> {
    const watchResponse = await transport.get(`https://www.youtube.com/watch?v=${videoId}`);
    if (watchResponse.status === 403 || watchResponse.status === 429) {
      throw new YouTubeVerificationError();
    }
    if (!watchResponse.ok) throw new Error(`YouTube 页面请求失败：${watchResponse.status}`);

    const html = await watchResponse.text();
    const player = parsePlayerResponse(html);
    if (isVerificationRequired(player, html)) throw new YouTubeVerificationError();

    const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const track = chooseCaptionTrack(tracks);
    const captionUrl = new URL(track.baseUrl);
    captionUrl.searchParams.set("fmt", "json3");

    const captionResponse = await transport.get(captionUrl.toString());
    if (!captionResponse.ok) throw new Error(`YouTube 字幕请求失败：${captionResponse.status}`);
    const segments = normalizeJson3Transcript(await captionResponse.json());
    if (segments.length === 0) throw new CaptionsNotFoundError();

    return {
      videoId,
      title: player.videoDetails?.title?.trim() || `YouTube ${videoId}`,
      language: track.languageCode,
      segments,
    };
  }
}
