import type { Provider, Model, App } from "../types";

function rowToProvider(row: Record<string, unknown>): Provider {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    type: row.type as "openai" | "openai-responses" | "anthropic",
    endpoint: row.endpoint as string,
    apiKey: row.api_key as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToModel(row: Record<string, unknown>): Model {
  const en = row.enabled;
  return {
    id: row.id as string,
    providerId: row.provider_id as string,
    modelId: row.model_id as string,
    enabled: en === undefined || en === null ? true : Number(en) === 1,
    createdAt: row.created_at as string,
  };
}

function rowToApp(row: Record<string, unknown>): App {
  const en = row.enabled;
  return {
    id: row.id as string,
    name: row.name as string,
    enabled: en === undefined || en === null ? true : Number(en) === 1,
    secretKey: (row.secret_key as string) ?? null,
    keyCreatedAt: (row.key_created_at as string) ?? null,
    createdAt: row.created_at as string,
  };
}

// --- Providers ---

export async function listProviders(db: D1Database): Promise<Provider[]> {
  const { results } = await db
    .prepare("SELECT * FROM providers ORDER BY created_at ASC")
    .all();
  return (results as Record<string, unknown>[]).map(rowToProvider);
}

export async function getProvider(
  db: D1Database,
  id: string
): Promise<Provider | null> {
  const row = await db
    .prepare("SELECT * FROM providers WHERE id = ?")
    .bind(id)
    .first();
  return row ? rowToProvider(row as Record<string, unknown>) : null;
}

export async function getProviderBySlug(
  db: D1Database,
  slug: string
): Promise<Provider | null> {
  const row = await db
    .prepare("SELECT * FROM providers WHERE slug = ?")
    .bind(slug)
    .first();
  return row ? rowToProvider(row as Record<string, unknown>) : null;
}

export async function createProvider(
  db: D1Database,
  p: Omit<Provider, "createdAt" | "updatedAt">
): Promise<Provider> {
  const now = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO providers (id, name, slug, type, endpoint, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(p.id, p.name, p.slug, p.type, p.endpoint, p.apiKey, now, now)
    .run();
  return { ...p, createdAt: now, updatedAt: now };
}

export async function updateProvider(
  db: D1Database,
  id: string,
  fields: Partial<Pick<Provider, "name" | "slug" | "type" | "endpoint" | "apiKey">>
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (fields.name !== undefined) { sets.push("name = ?"); values.push(fields.name); }
  if (fields.slug !== undefined) { sets.push("slug = ?"); values.push(fields.slug); }
  if (fields.type !== undefined) { sets.push("type = ?"); values.push(fields.type); }
  if (fields.endpoint !== undefined) { sets.push("endpoint = ?"); values.push(fields.endpoint); }
  if (fields.apiKey !== undefined) { sets.push("api_key = ?"); values.push(fields.apiKey); }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(id);
  await db
    .prepare(`UPDATE providers SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function deleteProvider(
  db: D1Database,
  id: string
): Promise<void> {
  await db.prepare("DELETE FROM providers WHERE id = ?").bind(id).run();
}

// --- Models ---

export async function listModels(
  db: D1Database,
  providerId: string
): Promise<Model[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM models WHERE provider_id = ? ORDER BY created_at ASC"
    )
    .bind(providerId)
    .all();
  return (results as Record<string, unknown>[]).map(rowToModel);
}

export async function listAllModelsWithProvider(
  db: D1Database
): Promise<(Model & { providerSlug: string; providerType: string; providerEndpoint: string; providerApiKey: string })[]> {
  const { results } = await db
    .prepare(
      `SELECT m.*, p.slug AS provider_slug, p.type AS provider_type, p.endpoint AS provider_endpoint, p.api_key AS provider_api_key
       FROM models m JOIN providers p ON m.provider_id = p.id
       WHERE m.enabled = 1
       ORDER BY p.slug, m.model_id`
    )
    .all();
  return (results as Record<string, unknown>[]).map((row) => ({
    ...rowToModel(row),
    providerSlug: row.provider_slug as string,
    providerType: row.provider_type as string,
    providerEndpoint: row.provider_endpoint as string,
    providerApiKey: row.provider_api_key as string,
  }));
}

export async function addModels(
  db: D1Database,
  providerId: string,
  modelIds: { id: string; modelId: string }[]
): Promise<void> {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO models (id, provider_id, model_id, created_at) VALUES (?, ?, ?, ?)"
  );
  const batch = modelIds.map((m) =>
    stmt.bind(m.id, providerId, m.modelId, now)
  );
  await db.batch(batch);
}

export async function deleteModel(
  db: D1Database,
  providerId: string,
  modelId: string
): Promise<void> {
  await db
    .prepare("DELETE FROM models WHERE provider_id = ? AND model_id = ?")
    .bind(providerId, modelId)
    .run();
}

export async function getModel(
  db: D1Database,
  providerId: string,
  modelId: string
): Promise<Model | null> {
  const row = await db
    .prepare("SELECT * FROM models WHERE provider_id = ? AND model_id = ?")
    .bind(providerId, modelId)
    .first();
  return row ? rowToModel(row as Record<string, unknown>) : null;
}

/** Provider slug + upstream model id; only rows with enabled = 1. */
export async function getEnabledProxyModel(
  db: D1Database,
  providerSlug: string,
  modelId: string
): Promise<{
  endpoint: string;
    apiKey: string;
    type: "openai" | "openai-responses" | "anthropic";
    modelId: string;
  } | null> {
  const row = await db
    .prepare(
      `SELECT p.endpoint AS endpoint, p.api_key AS api_key, p.type AS type
       FROM models m
       JOIN providers p ON m.provider_id = p.id
       WHERE p.slug = ? AND m.model_id = ? AND m.enabled = 1`
    )
    .bind(providerSlug, modelId)
    .first();
  if (!row) return null;
  return {
    endpoint: row.endpoint as string,
    apiKey: row.api_key as string,
    type: row.type as "openai" | "openai-responses" | "anthropic",
    modelId,
  };
}

export async function updateModelEnabled(
  db: D1Database,
  providerId: string,
  modelId: string,
  enabled: boolean
): Promise<boolean> {
  const r = await db
    .prepare(
      "UPDATE models SET enabled = ? WHERE provider_id = ? AND model_id = ?"
    )
    .bind(enabled ? 1 : 0, providerId, modelId)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

// --- Apps ---

export async function listApps(db: D1Database): Promise<App[]> {
  const { results } = await db
    .prepare("SELECT * FROM apps ORDER BY created_at ASC")
    .all();
  return (results as Record<string, unknown>[]).map(rowToApp);
}

export async function getApp(
  db: D1Database,
  id: string
): Promise<App | null> {
  const row = await db
    .prepare("SELECT * FROM apps WHERE id = ?")
    .bind(id)
    .first();
  return row ? rowToApp(row as Record<string, unknown>) : null;
}

export async function createApp(
  db: D1Database,
  app: Pick<App, "id" | "name">
): Promise<App> {
  const now = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO apps (id, name, created_at) VALUES (?, ?, ?)"
    )
    .bind(app.id, app.name, now)
    .run();
  return { id: app.id, name: app.name, enabled: true, secretKey: null, keyCreatedAt: null, createdAt: now };
}

export async function updateAppKey(
  db: D1Database,
  id: string,
  secretKey: string | null
): Promise<void> {
  const keyCreatedAt = secretKey ? new Date().toISOString() : null;
  await db
    .prepare("UPDATE apps SET secret_key = ?, key_created_at = ? WHERE id = ?")
    .bind(secretKey, keyCreatedAt, id)
    .run();
}

export async function updateAppEnabled(
  db: D1Database,
  id: string,
  enabled: boolean
): Promise<boolean> {
  const r = await db
    .prepare("UPDATE apps SET enabled = ? WHERE id = ?")
    .bind(enabled ? 1 : 0, id)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

export async function deleteApp(
  db: D1Database,
  id: string
): Promise<void> {
  await db.prepare("DELETE FROM apps WHERE id = ?").bind(id).run();
}

// --- Usage Logs ---

export interface UsageLogInput {
  id: string;
  appId: string;
  model: string;
  endpoint: string;
  promptTokens: number;
  completionTokens: number;
}

export async function insertUsageLog(
  db: D1Database,
  log: UsageLogInput
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO usage_logs (id, app_id, model, endpoint, prompt_tokens, completion_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
    )
    .bind(log.id, log.appId, log.model, log.endpoint, log.promptTokens, log.completionTokens)
    .run();
}

export interface UsageQueryParams {
  groupBy: "app" | "model";
  period: "day" | "week" | "month";
  start: string;
  end: string;
  appId?: string;
  model?: string;
}

export interface UsageRow {
  dateKey: string;
  dimension: string;
  dimensionName: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
}

export async function queryUsage(
  db: D1Database,
  params: UsageQueryParams
): Promise<UsageRow[]> {
  const dateExpr =
    params.period === "month"
      ? "strftime('%Y-%m', u.created_at)"
      : params.period === "week"
        ? "strftime('%Y-W%W', u.created_at)"
        : "strftime('%Y-%m-%d', u.created_at)";

  const dimCol = params.groupBy === "app" ? "u.app_id" : "u.model";

  const conditions = ["u.created_at >= ?", "u.created_at < ?"];
  const binds: unknown[] = [params.start, params.end];

  if (params.appId) {
    conditions.push("u.app_id = ?");
    binds.push(params.appId);
  }
  if (params.model) {
    conditions.push("u.model = ?");
    binds.push(params.model);
  }

  conditions.push(
    "EXISTS (SELECT 1 FROM models m JOIN providers p ON m.provider_id = p.id WHERE (p.slug || '/' || m.model_id) = u.model)"
  );

  const joinApps = params.groupBy === "app"
    ? "LEFT JOIN apps a ON u.app_id = a.id"
    : "";
  const nameExpr = params.groupBy === "app"
    ? "COALESCE(a.name, u.app_id)"
    : "u.model";

  const sql = `
    SELECT
      ${dateExpr} AS date_key,
      ${dimCol} AS dimension,
      ${nameExpr} AS dimension_name,
      COUNT(*) AS requests,
      SUM(u.prompt_tokens) AS prompt_tokens,
      SUM(u.completion_tokens) AS completion_tokens
    FROM usage_logs u
    ${joinApps}
    WHERE ${conditions.join(" AND ")}
    GROUP BY date_key, dimension
    ORDER BY date_key, dimension
  `;

  const { results } = await db.prepare(sql).bind(...binds).all();
  return (results as Record<string, unknown>[]).map((r) => ({
    dateKey: r.date_key as string,
    dimension: r.dimension as string,
    dimensionName: r.dimension_name as string,
    requests: r.requests as number,
    promptTokens: r.prompt_tokens as number,
    completionTokens: r.completion_tokens as number,
  }));
}
