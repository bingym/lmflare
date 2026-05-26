ALTER TABLE apps ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;

-- Recreate providers table with updated type constraint to include 'openai-responses'
CREATE TABLE providers_new (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  type       TEXT NOT NULL CHECK (type IN ('openai', 'anthropic', 'openai-responses')),
  endpoint   TEXT NOT NULL,
  api_key    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO providers_new SELECT * FROM providers;
DROP TABLE providers;
ALTER TABLE providers_new RENAME TO providers;
