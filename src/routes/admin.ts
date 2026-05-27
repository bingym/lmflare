import { Hono } from "hono";
import type { Env } from "../types";
import {
  listProviders,
  getProvider,
  createProvider,
  updateProvider,
  deleteProvider,
  listModels,
  addModels,
  deleteModel,
  getModel,
  updateModelEnabled,
  listApps,
  getApp,
  createApp,
  updateAppKey,
  updateAppEnabled,
  updateAppName,
  deleteApp,
  queryUsage,
} from "../services/db";
import { generateSecretKey, putKey, removeKey } from "../services/keyStore";

const admin = new Hono<{ Bindings: Env }>();

// --- Providers ---
admin.get("/providers", async (c) => {
  const providers = await listProviders(c.env.DB);
  return c.json(providers);
});

admin.post("/providers", async (c) => {
  const body = await c.req.json<{
    name: string;
    slug: string;
    type: "openai" | "openai-responses" | "anthropic";
    endpoint: string;
    apiKey: string;
  }>();
  const id = crypto.randomUUID();
  const provider = await createProvider(c.env.DB, { id, ...body });
  return c.json(provider, 201);
});

admin.put("/providers/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    slug?: string;
    type?: "openai" | "openai-responses" | "anthropic";
    endpoint?: string;
    apiKey?: string;
  }>();
  await updateProvider(c.env.DB, id, body);
  const updated = await getProvider(c.env.DB, id);
  if (!updated) return c.json({ error: "Provider not found" }, 404);
  return c.json(updated);
});

admin.delete("/providers/:id", async (c) => {
  const id = c.req.param("id");
  await deleteProvider(c.env.DB, id);
  return c.json({ ok: true });
});

// --- Models ---
admin.get("/providers/:id/models", async (c) => {
  const providerId = c.req.param("id");
  const models = await listModels(c.env.DB, providerId);
  return c.json(models);
});

admin.get("/providers/:id/models/remote", async (c) => {
  const providerId = c.req.param("id");
  const provider = await getProvider(c.env.DB, providerId);
  if (!provider) return c.json({ error: "Provider not found" }, 404);

  const endpoint = provider.endpoint.replace(/\/+$/, "");
  let url: string;
  let headers: Record<string, string>;

  if (provider.type === "anthropic") {
    url = `${endpoint}/v1/models`;
    headers = {
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    };
  } else {
    url = `${endpoint}/v1/models`;
    headers = {
      Authorization: `Bearer ${provider.apiKey}`,
    };
  }

  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      const text = await resp.text();
      return c.json(
        { error: `Upstream error: ${resp.status}`, detail: text },
        502
      );
    }
    const json = (await resp.json()) as { data?: { id: string; owned_by?: string }[] };
    const models = (json.data ?? []).map((m) => ({
      id: m.id,
      owned_by: m.owned_by ?? "",
    }));
    return c.json(models);
  } catch (err) {
    return c.json(
      { error: "Failed to fetch remote models", detail: String(err) },
      502
    );
  }
});

admin.post("/providers/:id/models", async (c) => {
  const providerId = c.req.param("id");
  const body = await c.req.json<{ modelIds: string[] }>();
  const items = body.modelIds.map((modelId) => ({
    id: crypto.randomUUID(),
    modelId,
  }));
  await addModels(c.env.DB, providerId, items);
  const models = await listModels(c.env.DB, providerId);
  return c.json(models, 201);
});

admin.delete("/providers/:id/models/:modelId", async (c) => {
  const providerId = c.req.param("id");
  const modelId = c.req.param("modelId");
  await deleteModel(c.env.DB, providerId, decodeURIComponent(modelId));
  return c.json({ ok: true });
});

admin.patch("/providers/:id/models/:modelId", async (c) => {
  const providerId = c.req.param("id");
  const modelId = decodeURIComponent(c.req.param("modelId"));
  const body = await c.req.json<{ enabled?: boolean }>();
  if (typeof body.enabled !== "boolean") {
    return c.json({ error: "enabled (boolean) is required" }, 400);
  }
  const ok = await updateModelEnabled(c.env.DB, providerId, modelId, body.enabled);
  if (!ok) return c.json({ error: "Model not found" }, 404);
  const updated = await getModel(c.env.DB, providerId, modelId);
  if (!updated) return c.json({ error: "Model not found" }, 404);
  return c.json(updated);
});

// --- Apps ---
admin.get("/apps", async (c) => {
  const apps = await listApps(c.env.DB);
  return c.json(apps);
});

admin.post("/apps", async (c) => {
  const body = await c.req.json<{ name: string }>();
  const id = crypto.randomUUID();
  const app = await createApp(c.env.DB, { id, name: body.name });
  return c.json(app, 201);
});

admin.patch("/apps/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ enabled?: boolean; name?: string }>();
  if (body.enabled === undefined && body.name === undefined) {
    return c.json({ error: "At least one of enabled or name is required" }, 400);
  }
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return c.json({ error: "name must be non-empty" }, 400);
    const ok = await updateAppName(c.env.DB, id, name);
    if (!ok) return c.json({ error: "App not found" }, 404);
  }
  if (typeof body.enabled === "boolean") {
    const ok = await updateAppEnabled(c.env.DB, id, body.enabled);
    if (!ok) return c.json({ error: "App not found" }, 404);
  }
  const updated = await getApp(c.env.DB, id);
  if (!updated) return c.json({ error: "App not found" }, 404);
  return c.json(updated);
});

admin.delete("/apps/:id", async (c) => {
  const id = c.req.param("id");
  const app = await getApp(c.env.DB, id);
  if (app?.secretKey) {
    await removeKey(c.env.KV, app.secretKey);
  }
  await deleteApp(c.env.DB, id);
  return c.json({ ok: true });
});

admin.post("/apps/:id/rotate-key", async (c) => {
  const id = c.req.param("id");
  const app = await getApp(c.env.DB, id);
  if (!app) return c.json({ error: "App not found" }, 404);

  // Remove old key from KV if exists
  if (app.secretKey) {
    await removeKey(c.env.KV, app.secretKey);
  }

  // Generate and store new key
  const newKey = generateSecretKey();
  await updateAppKey(c.env.DB, id, newKey);
  await putKey(c.env.KV, newKey, id);

  const updated = await getApp(c.env.DB, id);
  return c.json(updated);
});

// --- Usage ---
admin.get("/usage", async (c) => {
  const groupBy = (c.req.query("group_by") ?? "app") as "app" | "model";
  const period = (c.req.query("period") ?? "day") as "day" | "week" | "month";
  const start = c.req.query("start") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const end = c.req.query("end") ?? new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const appId = c.req.query("app_id");
  const model = c.req.query("model");

  const rows = await queryUsage(c.env.DB, {
    groupBy,
    period,
    start,
    end,
    appId: appId || undefined,
    model: model || undefined,
  });

  return c.json(rows);
});

export default admin;
