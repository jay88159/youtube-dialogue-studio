import type { TranscriptSource } from "@/shared/contracts";

export interface TranscriptSegment {
  startMs: number;
  durationMs: number;
  text: string;
}

export interface TranscriptDocument {
  videoId: string;
  title: string;
  language: string;
  segments: TranscriptSegment[];
}

export interface TranscriptFixture extends TranscriptDocument {
  sourceNote: string;
}

export interface ResolvedTranscript {
  source: TranscriptSource;
  transcript: TranscriptDocument | TranscriptFixture;
}

export interface HttpTransport {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface TranscriptProvider {
  fetch(videoId: string, transport: HttpTransport): Promise<TranscriptDocument>;
}

export interface VideoTranscriptFallback {
  fetch(videoId: string): Promise<TranscriptDocument>;
}
