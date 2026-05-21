CREATE TABLE IF NOT EXISTS meta_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text,
  account_name text,
  access_token text,
  bm_id text,
  bm_name text,
  projeto_id uuid REFERENCES projetos(id) ON DELETE SET NULL,
  status text DEFAULT 'connected',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE meta_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own meta connections" ON meta_connections FOR ALL USING (auth.uid() = user_id);
