import type { FiveWOneH } from "@/shared/contracts";

import { fiveWOneHSchema } from "./five-w-one-h";
import {
  buildArticleRequest,
  buildSummaryRequest,
  type ArticlePromptInput,
  type SummaryPromptInput,
} from "./prompts";
import { parseGeminiSse } from "./sse";

interface GeminiClientOptions {
  apiKey: string;
  model: string;
  fetcher?: typeof fetch;
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

export class GeminiResponseError extends Error {
  readonly retryable: boolean;

  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GeminiResponseError";
    this.retryable = status === 429 || status >= 500;
  }
}

export class GeminiClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: GeminiClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async *streamArticle(
    input: ArticlePromptInput,
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const response = await this.request("streamGenerateContent?alt=sse", buildArticleRequest(input), signal);
    if (!response.body) throw new GeminiResponseError("Gemini 未返回流式响应", 502);
    yield* parseGeminiSse(response.body);
  }

  async summarizeChapter(input: SummaryPromptInput): Promise<FiveWOneH> {
    const response = await this.request("generateContent", buildSummaryRequest(input));
    const payload = await response.json() as GenerateContentResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
    if (!text) throw new GeminiResponseError("Gemini 未返回 5W1H 内容", 502);

    try {
      return fiveWOneHSchema.parse(JSON.parse(text));
    } catch (error) {
      throw new GeminiResponseError(
        `Gemini 5W1H 响应不符合固定格式：${error instanceof Error ? error.message : "未知错误"}`,
        502,
      );
    }
  }

  private async request(method: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    const model = encodeURIComponent(this.options.model);
    const response = await this.fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.options.apiKey,
        },
        body: JSON.stringify(body),
        signal,
      },
    );

    if (!response.ok) {
      let message = `Gemini 请求失败：${response.status}`;
      try {
        const payload = await response.clone().json() as { error?: { message?: string } };
        if (payload.error?.message) message = payload.error.message;
      } catch {
        // The stable status code remains useful when the upstream body is not JSON.
      }
      throw new GeminiResponseError(message, response.status);
    }

    return response;
  }
}
