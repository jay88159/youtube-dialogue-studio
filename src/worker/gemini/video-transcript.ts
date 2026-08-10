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

export function buildExtractedVideoTranscriptSchema(profile: VideoContentMapProfile) {
  const segmentSchema = z.object({
    startMs: z.number().int().nonnegative(),
    durationMs: z.number().int().positive(),
    text: z.string().trim().min(1).max(profile.maxTextLength),
  }).strict();

  return z.object({
    title: z.string().trim().min(1),
    language: z.string().trim().min(1),
    segments: z.array(segmentSchema).min(1).max(profile.maxSegments),
  }).strict();
}
