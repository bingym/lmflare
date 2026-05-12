-- providers table
CREATE TABLE providers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  type       TEXT NOT NULL CHECK (type IN ('openai', 'anthropic')),
  endpoint   TEXT NOT NULL,
  api_key    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- models table (proxied models per provider)
CREATE TABLE models (
  id          TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_id    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider_id, model_id)
);

-- apps table
CREATE TABLE apps (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  secret_key     TEXT,
  key_created_at TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
