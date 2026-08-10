export type TranscriptSource = "direct" | "proxy" | "fixture" | "gemini";

export interface ChapterDescriptor {
  id: string;
  title: string;
}

export interface ArticleSection extends ChapterDescriptor {
  markdown: string;
}

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface FiveWOneH {
  who: string;
  what: string;
  when: string;
  where: string;
  why: string;
  how: string;
}

export interface GenerationRequest {
  url: string;
  requirement?: string;
}

export type GenerationEvent =
  | { type: "generation.created"; generationId: string }
  | {
      type: "transcript.ready";
      source: TranscriptSource;
      segmentCount: number;
    }
  | { type: "article.delta"; text: string }
  | { type: "article.completed"; chapters: ChapterDescriptor[] }
  | { type: "generation.failed"; error: ApiError };
