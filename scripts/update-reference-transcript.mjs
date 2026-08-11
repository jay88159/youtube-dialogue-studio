import { writeFile } from "node:fs/promises";

import { getVideoDetails } from "youtube-caption-extractor";

const videoId = "xRh2sVcNXQ8";
const details = await getVideoDetails({ videoID: videoId, lang: "en" });
if (details.subtitles.length < 2_000) {
  throw new Error(`Reference transcript is unexpectedly short: ${details.subtitles.length} segments`);
}

const fixture = {
  videoId,
  title: details.title,
  language: "en",
  sourceNote: "使用 youtube-caption-extractor 从参考视频 YouTube 字幕轨道提取的完整英文字幕快照",
  segments: details.subtitles.map((subtitle) => ({
    startMs: Math.max(0, Math.round(Number(subtitle.start) * 1000)),
    durationMs: Math.max(1, Math.round(Number(subtitle.dur) * 1000)),
    text: subtitle.text.trim(),
  })),
};

const target = new URL("../fixtures/xRh2sVcNXQ8.json", import.meta.url);
await writeFile(target, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  videoId,
  title: fixture.title,
  segments: fixture.segments.length,
  durationMs: fixture.segments.at(-1).startMs + fixture.segments.at(-1).durationMs,
}));
