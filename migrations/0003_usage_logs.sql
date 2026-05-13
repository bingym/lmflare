CREATE TABLE usage_logs (
  id                TEXT PRIMARY KEY,
  app_id            TEXT NOT NULL,
  model             TEXT NOT NULL,
  endpoint          TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_usage_app_date ON usage_logs(app_id, created_at);
CREATE INDEX idx_usage_model_date ON usage_logs(model, created_at);
