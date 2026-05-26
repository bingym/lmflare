import { createMiddleware } from "hono/factory";
import type { Env } from "../types";
import { lookupKey } from "../services/keyStore";
import { getApp } from "../services/db";

/**
 * Authenticates proxy requests using app secret keys.
 * Supports both OpenAI-style (Authorization: Bearer) and
 * Anthropic-style (x-api-key header).
 */
export const appAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  let key: string | undefined;

  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    key = authHeader.slice(7);
  }

  if (!key) {
    key = c.req.header("x-api-key") ?? undefined;
  }

  if (!key) {
    return c.json({ error: "Missing API key" }, 401);
  }

  const appId = await lookupKey(c.env.KV, key);
  if (!appId) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  const app = await getApp(c.env.DB, appId);
  if (!app || !app.enabled) {
    return c.json({ error: "App is disabled" }, 403);
  }

  c.set("appId" as never, appId);
  await next();
});
