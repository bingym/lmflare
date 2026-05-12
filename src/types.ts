export interface Provider {
  id: string;
  name: string;
  slug: string;
  type: "openai" | "anthropic";
  endpoint: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface Model {
  id: string;
  providerId: string;
  modelId: string;
  createdAt: string;
}

export interface App {
  id: string;
  name: string;
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
  APP_KEYS: KVNamespace;
  ASSETS: Fetcher;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  JWT_SECRET: string;
}
