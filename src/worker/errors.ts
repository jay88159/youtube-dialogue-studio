import type { ApiError } from "@/shared/contracts";
import { InvalidYouTubeUrlError } from "@/shared/youtube-url";

import { GeminiResponseError } from "./gemini/client";
import {
  CaptionsNotFoundError,
  YouTubeVerificationError,
} from "./transcript/youtube";

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof InvalidYouTubeUrlError) {
    return new AppError("INVALID_YOUTUBE_URL", error.message, 400, false);
  }
  if (error instanceof CaptionsNotFoundError) {
    return new AppError("CAPTIONS_NOT_FOUND", error.message, 422, false);
  }
  if (error instanceof YouTubeVerificationError) {
    return new AppError(
      "YOUTUBE_VERIFICATION_REQUIRED",
      "YouTube 要求验证码，且代理或参考字幕均不可用",
      502,
      true,
    );
  }
  if (error instanceof GeminiResponseError) {
    return new AppError(
      error.status === 429 ? "GEMINI_QUOTA_EXHAUSTED" : "GEMINI_UPSTREAM_ERROR",
      error.status === 429 ? "Gemini 免费额度暂时耗尽，请稍后重试" : error.message,
      error.status,
      error.retryable,
    );
  }

  return new AppError(
    "INTERNAL_ERROR",
    error instanceof Error ? error.message : "服务暂时不可用",
    500,
    true,
  );
}

export function apiError(error: unknown): { error: ApiError; status: number } {
  const normalized = normalizeError(error);
  return {
    error: {
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
    },
    status: normalized.status,
  };
}
