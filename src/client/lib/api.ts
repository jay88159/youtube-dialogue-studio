import type { ApiError, FiveWOneH, GenerationRequest } from "@/shared/contracts";

interface ErrorEnvelope {
  error?: ApiError;
}

export class ClientApiError extends Error {
  constructor(readonly detail: ApiError) {
    super(detail.message);
    this.name = "ClientApiError";
  }
}

async function responseError(response: Response): Promise<ClientApiError> {
  try {
    const payload = await response.clone().json() as ErrorEnvelope;
    if (payload.error) return new ClientApiError(payload.error);
  } catch {
    // Fall through to a stable status-based error.
  }

  return new ClientApiError({
    code: "HTTP_ERROR",
    message: `请求失败（${response.status}）`,
    retryable: response.status === 429 || response.status >= 500,
  });
}

export async function createGeneration(
  request: GenerationRequest,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const response = await globalThis.fetch("/api/generations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) throw await responseError(response);
  if (!response.body) {
    throw new ClientApiError({
      code: "EMPTY_STREAM",
      message: "服务端没有返回流式内容",
      retryable: true,
    });
  }
  return response.body;
}

export async function requestChapterSummary(
  generationId: string,
  chapterId: string,
): Promise<FiveWOneH> {
  const response = await globalThis.fetch(
    `/api/generations/${generationId}/chapters/${chapterId}/5w1h`,
    { method: "POST" },
  );
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<FiveWOneH>;
}
