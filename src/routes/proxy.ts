import { Hono } from "hono";
import type { Env } from "../types";
import { appAuth } from "../middleware/appAuth";
import { listAllModelsWithProvider, getEnabledProxyModel, insertUsageLog } from "../services/db";
import { proxyToOpenAI, anthropicToOpenAI } from "../adapters/openai";
import { proxyToAnthropic, openaiToAnthropic } from "../adapters/anthropic";
import type { ProxyTarget } from "../adapters/base";
import { extractUsageFromJSON, wrapStreamForUsage, type TokenUsage } from "../services/usage";

const proxy = new Hono<{ Bindings: Env }>();

proxy.use("/*", appAuth);

function parseModelField(model: string): { slug: string; modelId: string } | null {
  const slashIndex = model.indexOf("/");
  if (slashIndex <= 0) return null;
  return {
    slug: model.substring(0, slashIndex),
    modelId: model.substring(slashIndex + 1),
  };
}

async function resolveTarget(
  db: D1Database,
  modelField: string
): Promise<{ target: ProxyTarget } | { error: string; status: number }> {
  const parsed = parseModelField(modelField);
  if (!parsed) {
    return { error: `Invalid model format: "${modelField}". Use "provider/model" format.`, status: 400 };
  }

  const row = await getEnabledProxyModel(db, parsed.slug, parsed.modelId);
  if (!row) {
    return {
      error: `Model "${parsed.slug}/${parsed.modelId}" is not available (disabled or not configured).`,
      status: 404,
    };
  }

  return {
    target: {
      endpoint: row.endpoint,
      apiKey: row.apiKey,
      providerType: row.type,
      modelId: row.modelId,
    },
  };
}

function logUsage(
  ctx: ExecutionContext,
  db: D1Database,
  appId: string,
  model: string,
  endpoint: string,
  usagePromise: Promise<TokenUsage>
) {
  ctx.waitUntil(
    usagePromise.then((u) =>
      insertUsageLog(db, {
        id: crypto.randomUUID(),
        appId,
        model,
        endpoint,
        promptTokens: u.prompt_tokens,
        completionTokens: u.completion_tokens,
      })
    ).catch(() => {})
  );
}

function trackResponse(
  resp: Response,
  isStreaming: boolean
): { response: Response; usage: Promise<TokenUsage> } {
  if (isStreaming && resp.body) {
    const { stream, usage } = wrapStreamForUsage(resp.body);
    return {
      response: new Response(stream, {
        status: resp.status,
        headers: resp.headers,
      }),
      usage,
    };
  }

  const cloned = resp.clone();
  const usage = cloned.json()
    .then((body) => extractUsageFromJSON(body as Record<string, unknown>))
    .catch(() => ({ prompt_tokens: 0, completion_tokens: 0 }));
  return { response: resp, usage };
}

// --- GET /v1/models ---
proxy.get("/models", async (c) => {
  const allModels = await listAllModelsWithProvider(c.env.DB);
  const data = allModels.map((m) => ({
    id: `${m.providerSlug}/${m.modelId}`,
    object: "model",
    created: Math.floor(new Date(m.createdAt).getTime() / 1000),
    owned_by: m.providerSlug,
  }));
  return c.json({ object: "list", data });
});

// --- POST /v1/chat/completions ---
proxy.post("/chat/completions", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const model = body.model as string;
  if (!model) return c.json({ error: "Missing model field" }, 400);

  const result = await resolveTarget(c.env.DB, model);
  if ("error" in result) return c.json({ error: result.error }, result.status as 400);

  const { target } = result;
  const isStreaming = body.stream === true;
  const appId = c.get("appId" as never) as string;

  const raw = target.providerType === "anthropic"
    ? await openaiToAnthropic(target, body, isStreaming)
    : await proxyToOpenAI(target, "/v1/chat/completions", body, isStreaming);

  const { response, usage } = trackResponse(raw, isStreaming);
  logUsage(c.executionCtx, c.env.DB, appId, model, "chat/completions", usage);
  return response;
});

// --- POST /v1/responses ---
proxy.post("/responses", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const model = body.model as string;
  if (!model) return c.json({ error: "Missing model field" }, 400);

  const result = await resolveTarget(c.env.DB, model);
  if ("error" in result) return c.json({ error: result.error }, result.status as 400);

  const { target } = result;
  const isStreaming = body.stream === true;
  const appId = c.get("appId" as never) as string;

  if (target.providerType === "anthropic") {
    return c.json(
      { error: "Responses API is not supported for Anthropic providers" },
      400
    );
  }

  const raw = await proxyToOpenAI(target, "/v1/responses", body, isStreaming);
  const { response, usage } = trackResponse(raw, isStreaming);
  logUsage(c.executionCtx, c.env.DB, appId, model, "responses", usage);
  return response;
});

// --- POST /v1/messages (Anthropic-style) ---
proxy.post("/messages", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const model = body.model as string;
  if (!model) return c.json({ error: "Missing model field" }, 400);

  const result = await resolveTarget(c.env.DB, model);
  if ("error" in result) return c.json({ error: result.error }, result.status as 400);

  const { target } = result;
  const isStreaming = body.stream === true;
  const appId = c.get("appId" as never) as string;

  const raw = target.providerType === "anthropic"
    ? await proxyToAnthropic(target, body, isStreaming)
    : await anthropicToOpenAI(target, body, isStreaming);

  const { response, usage } = trackResponse(raw, isStreaming);
  logUsage(c.executionCtx, c.env.DB, appId, model, "messages", usage);
  return response;
});

export default proxy;
