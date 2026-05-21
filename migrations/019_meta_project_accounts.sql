CREATE TABLE IF NOT EXISTS meta_project_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  projeto_id uuid REFERENCES projetos(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  account_name text,
  bm_id text,
  bm_name text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(projeto_id, account_id)
);
ALTER TABLE meta_project_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own meta project accounts" ON meta_project_accounts FOR ALL USING (auth.uid() = user_id);
