import { Hono } from "hono";
import { z } from "zod";

import { parseYouTubeUrl } from "@/shared/youtube-url";

import type { AppEnv } from "./env";
import { apiError } from "./errors";
import { apiSecurityHeaders } from "./security";

type Bindings = { Bindings: AppEnv };

const generationSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  requirement: z.string().trim().max(1000).optional(),
}).strict();

const generationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const chapterIdPattern = /^chapter-[1-9]\d*$/;

export const app = new Hono<Bindings>();

app.use("/api/*", apiSecurityHeaders);

app.post("/api/generations", async (context) => {
  try {
    const payload = generationSchema.parse(await context.req.json());
    const video = parseYouTubeUrl(payload.url);
    const generationId = crypto.randomUUID();
    const session = context.env.GENERATION_SESSION.getByName(generationId);

    return session.fetch("https://generation-session/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        generationId,
        videoId: video.videoId,
        requirement: payload.requirement || undefined,
      }),
    });
  } catch (error) {
    const normalized = error instanceof z.ZodError
      ? {
          error: {
            code: "INVALID_REQUEST",
            message: "请求格式不正确",
            retryable: false,
          },
          status: 400,
        }
      : apiError(error);
    return context.json({ error: normalized.error }, normalized.status as 400);
  }
});

app.post("/api/generations/:generationId/chapters/:chapterId/5w1h", async (context) => {
  const generationId = context.req.param("generationId");
  const chapterId = context.req.param("chapterId");
  if (!generationIdPattern.test(generationId) || !chapterIdPattern.test(chapterId)) {
    return context.json(
      { error: { code: "INVALID_RESOURCE_ID", message: "生成或章节 ID 非法", retryable: false } },
      400,
    );
  }

  const session = context.env.GENERATION_SESSION.getByName(generationId);
  return session.fetch(`https://generation-session/chapters/${chapterId}/5w1h`, {
    method: "POST",
  });
});

app.notFound((context) => {
  if (context.req.path.startsWith("/api/")) {
    return context.json(
      { error: { code: "NOT_FOUND", message: "接口不存在", retryable: false } },
      404,
    );
  }
  return context.env.ASSETS.fetch(context.req.raw);
});

app.onError((error, context) => {
  const normalized = apiError(error);
  return context.json({ error: normalized.error }, normalized.status as 500);
});
