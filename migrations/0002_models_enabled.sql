-- Whether the model is exposed on GET /v1/models and allowed for proxy calls (1 = on)
ALTER TABLE models ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
