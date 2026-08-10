import { describe, expect, it } from "vitest";

import { InvalidYouTubeUrlError, parseYouTubeUrl } from "@/shared/youtube-url";

describe("parseYouTubeUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=xRh2sVcNXQ8", "xRh2sVcNXQ8"],
    ["https://youtu.be/xRh2sVcNXQ8?t=42", "xRh2sVcNXQ8"],
    ["https://m.youtube.com/shorts/xRh2sVcNXQ8", "xRh2sVcNXQ8"],
    ["https://youtube.com/embed/xRh2sVcNXQ8", "xRh2sVcNXQ8"],
  ])("extracts the video ID from %s", (url, expected) => {
    expect(parseYouTubeUrl(url)).toEqual({
      videoId: expected,
      canonicalUrl: `https://www.youtube.com/watch?v=${expected}`,
    });
  });

  it.each([
    "",
    "not a url",
    "https://youtube.com.evil.example/watch?v=xRh2sVcNXQ8",
    "https://www.youtube.com/watch?v=too-short",
    "https://www.youtube.com/playlist?list=xRh2sVcNXQ8",
  ])("rejects unsupported input %s", (url) => {
    expect(() => parseYouTubeUrl(url)).toThrow(InvalidYouTubeUrlError);
  });
});
