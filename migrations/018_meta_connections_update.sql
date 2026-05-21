ALTER TABLE meta_connections ADD COLUMN IF NOT EXISTS meta_user_id text;
ALTER TABLE meta_connections ADD COLUMN IF NOT EXISTS meta_user_name text;

-- Unique index so upsert ON CONFLICT (user_id) works; NULLs are excluded
CREATE UNIQUE INDEX IF NOT EXISTS meta_connections_user_id_key
  ON meta_connections (user_id)
  WHERE user_id IS NOT NULL;
