const BASE = "/api/admin";

function getToken(): string | null {
  return localStorage.getItem("lmflare_token");
}

export function setToken(token: string) {
  localStorage.setItem("lmflare_token", token);
}

export function clearToken() {
  localStorage.removeItem("lmflare_token");
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const resp = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  if (resp.status === 401) {
    // POST /login returns 401 for wrong password — show error on page, do not hard-navigate
    if (path === "/login") {
      const body = await resp.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? "Invalid credentials");
    }
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${resp.status}`);
  }

  return resp.json() as Promise<T>;
}

// --- Auth ---
export async function login(username: string, password: string): Promise<string> {
  const data = await request<{ token: string }>("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  return data.token;
}

// --- Providers ---
export interface ProviderDTO {
  id: string;
  name: string;
  slug: string;
  type: "openai" | "anthropic";
  endpoint: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
}

export async function listProviders(): Promise<ProviderDTO[]> {
  return request("/providers");
}

export async function createProvider(data: {
  name: string;
  slug: string;
  type: "openai" | "anthropic";
  endpoint: string;
  apiKey: string;
}): Promise<ProviderDTO> {
  return request("/providers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateProvider(
  id: string,
  data: Partial<{
    name: string;
    slug: string;
    type: "openai" | "anthropic";
    endpoint: string;
    apiKey: string;
  }>
): Promise<ProviderDTO> {
  return request(`/providers/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteProvider(id: string): Promise<void> {
  await request(`/providers/${id}`, { method: "DELETE" });
}

// --- Models ---
export interface ModelDTO {
  id: string;
  providerId: string;
  modelId: string;
  enabled: boolean;
  createdAt: string;
}

export interface RemoteModelDTO {
  id: string;
  owned_by: string;
}

export async function listModels(providerId: string): Promise<ModelDTO[]> {
  return request(`/providers/${providerId}/models`);
}

export async function fetchRemoteModels(
  providerId: string
): Promise<RemoteModelDTO[]> {
  return request(`/providers/${providerId}/models/remote`);
}

export async function addModels(
  providerId: string,
  modelIds: string[]
): Promise<ModelDTO[]> {
  return request(`/providers/${providerId}/models`, {
    method: "POST",
    body: JSON.stringify({ modelIds }),
  });
}

export async function removeModel(
  providerId: string,
  modelId: string
): Promise<void> {
  await request(`/providers/${providerId}/models/${encodeURIComponent(modelId)}`, {
    method: "DELETE",
  });
}

export async function setModelEnabled(
  providerId: string,
  modelId: string,
  enabled: boolean
): Promise<ModelDTO> {
  return request(`/providers/${providerId}/models/${encodeURIComponent(modelId)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

// --- Apps ---
export interface AppDTO {
  id: string;
  name: string;
  secretKey: string | null;
  keyCreatedAt: string | null;
  createdAt: string;
}

export async function listApps(): Promise<AppDTO[]> {
  return request("/apps");
}

export async function createApp(name: string): Promise<AppDTO> {
  return request("/apps", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deleteApp(id: string): Promise<void> {
  await request(`/apps/${id}`, { method: "DELETE" });
}

export async function rotateKey(appId: string): Promise<AppDTO> {
  return request(`/apps/${appId}/rotate-key`, { method: "POST" });
}

// --- Usage ---
export interface UsageRowDTO {
  dateKey: string;
  dimension: string;
  dimensionName: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
}

export async function fetchUsage(params: {
  groupBy: "app" | "model";
  period: "day" | "week" | "month";
  start: string;
  end: string;
  appId?: string;
  model?: string;
}): Promise<UsageRowDTO[]> {
  const qs = new URLSearchParams({
    group_by: params.groupBy,
    period: params.period,
    start: params.start,
    end: params.end,
  });
  if (params.appId) qs.set("app_id", params.appId);
  if (params.model) qs.set("model", params.model);
  return request(`/usage?${qs.toString()}`);
}
