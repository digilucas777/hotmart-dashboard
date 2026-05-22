CREATE TABLE IF NOT EXISTS meta_insights_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid REFERENCES projetos(id) ON DELETE CASCADE,
  date_preset text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(projeto_id, date_preset)
);
ALTER TABLE meta_insights_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own meta cache" ON meta_insights_cache FOR ALL USING (
  EXISTS (SELECT 1 FROM projetos WHERE id = projeto_id AND user_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS meta_ads_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid REFERENCES projetos(id) ON DELETE CASCADE,
  date_preset text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(projeto_id, date_preset)
);
ALTER TABLE meta_ads_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own meta ads cache" ON meta_ads_cache FOR ALL USING (
  EXISTS (SELECT 1 FROM projetos WHERE id = projeto_id AND user_id = auth.uid())
);
