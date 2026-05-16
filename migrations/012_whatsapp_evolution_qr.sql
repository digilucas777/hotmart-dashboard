ALTER TABLE whatsapp_connections
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'cloud',
  ADD COLUMN IF NOT EXISTS evolution_url TEXT,
  ADD COLUMN IF NOT EXISTS evolution_api_key TEXT,
  ADD COLUMN IF NOT EXISTS evolution_instance TEXT;

NOTIFY pgrst, 'reload schema';
