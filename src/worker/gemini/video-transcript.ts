import { z } from "zod";

export interface VideoContentMapProfile {
  maxSegments: number;
  maxTextLength: number;
  maxOutputTokens: number;
}

export const VIDEO_CONTENT_MAP_PROFILES = {
  standard: { maxSegments: 96, maxTextLength: 240, maxOutputTokens: 32_768 },
  compact: { maxSegments: 48, maxTextLength: 180, maxOutputTokens: 16_384 },
} as const satisfies Record<string, VideoContentMapProfile>;

const extractedVideoSegmentSchema = z.object({
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  text: z.string().trim().min(1),
}).strict();

const extractedVideoTranscriptSchema = z.object({
  title: z.string().trim().min(1),
  language: z.string().trim().min(1),
  segments: z.array(extractedVideoSegmentSchema).min(1),
}).strict();

function truncateSegmentText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const prefix = text.slice(0, maxLength - 1).trimEnd();
  return `${prefix}…`;
}

function sampleAcrossTimeline<T>(items: T[], maximum: number): T[] {
  if (items.length <= maximum) return items;
  if (maximum === 1) return [items[0]];

  return Array.from(
    { length: maximum },
    (_, index) => items[Math.round(index * (items.length - 1) / (maximum - 1))],
  );
}

export function parseExtractedVideoTranscript(
  input: unknown,
  profile: VideoContentMapProfile,
) {
  const transcript = extractedVideoTranscriptSchema.parse(input);
  const segments = sampleAcrossTimeline(transcript.segments, profile.maxSegments)
    .map((segment) => ({
      ...segment,
      text: truncateSegmentText(segment.text, profile.maxTextLength),
    }));

  return { ...transcript, segments };
}
