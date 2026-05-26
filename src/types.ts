export type ProviderType = "openai" | "openai-responses" | "anthropic";

export interface Provider {
  id: string;
  name: string;
  slug: string;
  type: ProviderType;
  endpoint: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface Model {
  id: string;
  providerId: string;
  modelId: string;
  enabled: boolean;
  createdAt: string;
}

export interface App {
  id: string;
  name: string;
  enabled: boolean;
  secretKey: string | null;
  keyCreatedAt: string | null;
  createdAt: string;
}

export interface RemoteModel {
  id: string;
  owned_by?: string;
}

export interface ProviderWithModels extends Provider {
  models: Model[];
}

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ASSETS: Fetcher;
}
