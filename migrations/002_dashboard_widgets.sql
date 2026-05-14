CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id UUID REFERENCES projetos(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  data_source TEXT NOT NULL,
  title TEXT NOT NULL,
  width TEXT NOT NULL DEFAULT 'half',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dashboard_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_dashboard_widgets"
  ON dashboard_widgets
  FOR ALL
  USING (true)
  WITH CHECK (true);
