import { Hono } from "hono";
import type { Env } from "../types";
import { appAuth } from "../middleware/appAuth";
import { listAllModelsWithProvider, getProviderBySlug } from "../services/db";
import { proxyToOpenAI, anthropicToOpenAI } from "../adapters/openai";
import { proxyToAnthropic, openaiToAnthropic } from "../adapters/anthropic";
import type { ProxyTarget } from "../adapters/base";

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

  const provider = await getProviderBySlug(db, parsed.slug);
  if (!provider) {
    return { error: `Provider "${parsed.slug}" not found`, status: 404 };
  }

  return {
    target: {
      endpoint: provider.endpoint,
      apiKey: provider.apiKey,
      providerType: provider.type,
      modelId: parsed.modelId,
    },
  };
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

  if (target.providerType === "openai") {
    return proxyToOpenAI(target, "/v1/chat/completions", body, isStreaming);
  } else {
    return openaiToAnthropic(target, body, isStreaming);
  }
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

  if (target.providerType === "openai") {
    return proxyToOpenAI(target, "/v1/responses", body, isStreaming);
  } else {
    return c.json(
      { error: "Responses API is not supported for Anthropic providers" },
      400
    );
  }
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

  if (target.providerType === "anthropic") {
    return proxyToAnthropic(target, body, isStreaming);
  } else {
    return anthropicToOpenAI(target, body, isStreaming);
  }
});

export default proxy;
