import type { MiddlewareHandler } from "hono";

export const apiSecurityHeaders: MiddlewareHandler = async (context, next) => {
  await next();
  context.header("cache-control", "no-store");
  context.header("referrer-policy", "no-referrer");
  context.header("x-content-type-options", "nosniff");
  context.header("x-frame-options", "DENY");
};
