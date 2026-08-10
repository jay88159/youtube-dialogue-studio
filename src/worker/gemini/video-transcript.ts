import { z } from "zod";

const videoTranscriptSegmentSchema = z.object({
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  text: z.string().trim().min(1),
}).strict();

export const extractedVideoTranscriptSchema = z.object({
  title: z.string().trim().min(1),
  language: z.string().trim().min(1),
  segments: z.array(videoTranscriptSegmentSchema).min(1),
}).strict();
