import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ApiError,
  ChapterDescriptor,
  GenerationRequest,
  TranscriptSource,
} from "@/shared/contracts";
import { decodeNdjson } from "@/shared/ndjson";

import { ClientApiError, createGeneration } from "../lib/api";

export type GenerationPhase =
  | "idle"
  | "starting"
  | "transcript"
  | "generating"
  | "completed"
  | "error";

export interface GenerationState {
  phase: GenerationPhase;
  generationId?: string;
  source?: TranscriptSource;
  segmentCount?: number;
  article: string;
  chapters: ChapterDescriptor[];
  error?: ApiError;
}

const initialState: GenerationState = {
  phase: "idle",
  article: "",
  chapters: [],
};

function unknownError(error: unknown): ApiError {
  if (error instanceof ClientApiError) return error.detail;
  return {
    code: "CLIENT_ERROR",
    message: error instanceof Error ? error.message : "生成过程中出现未知错误",
    retryable: true,
  };
}

export function useGeneration() {
  const [state, setState] = useState<GenerationState>(initialState);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState((current) => current.phase === "completed"
      ? current
      : { ...current, phase: "idle", error: undefined });
  }, []);

  const generate = useCallback(async (request: GenerationRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ ...initialState, phase: "starting" });

    try {
      const stream = await createGeneration(request, controller.signal);
      for await (const event of decodeNdjson(stream)) {
        if (controller.signal.aborted) return;

        switch (event.type) {
          case "generation.created":
            setState((current) => ({
              ...current,
              phase: "transcript",
              generationId: event.generationId,
            }));
            break;
          case "transcript.ready":
            setState((current) => ({
              ...current,
              phase: "generating",
              source: event.source,
              segmentCount: event.segmentCount,
            }));
            break;
          case "article.delta":
            setState((current) => ({
              ...current,
              phase: "generating",
              article: current.article + event.text,
            }));
            break;
          case "article.completed":
            setState((current) => ({
              ...current,
              phase: "completed",
              chapters: event.chapters,
            }));
            break;
          case "generation.failed":
            setState((current) => ({
              ...current,
              phase: "error",
              error: event.error,
            }));
            return;
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setState((current) => ({
        ...current,
        phase: "error",
        error: unknownError(error),
      }));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { state, generate, cancel };
}
