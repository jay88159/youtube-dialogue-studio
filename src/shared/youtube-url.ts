export interface ParsedVideoUrl {
  videoId: string;
  canonicalUrl: string;
}

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
]);

export class InvalidYouTubeUrlError extends Error {
  constructor() {
    super("请输入有效的 YouTube 视频链接");
    this.name = "InvalidYouTubeUrlError";
  }
}

export function parseYouTubeUrl(input: string): ParsedVideoUrl {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new InvalidYouTubeUrlError();
  }

  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new InvalidYouTubeUrlError();
  }

  const host = url.hostname.toLowerCase();
  let videoId: string | null = null;

  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else {
      const [kind, id] = url.pathname.split("/").filter(Boolean);
      if (kind === "shorts" || kind === "embed") videoId = id ?? null;
    }
  }

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
    throw new InvalidYouTubeUrlError();
  }

  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
