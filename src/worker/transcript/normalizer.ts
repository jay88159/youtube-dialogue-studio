import type { TranscriptSegment } from "./types";

interface Json3Segment {
  utf8?: string;
}

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Json3Segment[];
}

interface Json3Transcript {
  events?: Json3Event[];
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeJson3Transcript(payload: Json3Transcript): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  for (const event of payload.events ?? []) {
    const text = normalizeText((event.segs ?? []).map((segment) => segment.utf8 ?? "").join(""));
    if (!text) continue;

    segments.push({
      startMs: Math.max(0, event.tStartMs ?? 0),
      durationMs: Math.max(0, event.dDurationMs ?? 0),
      text,
    });
  }

  return segments;
}
