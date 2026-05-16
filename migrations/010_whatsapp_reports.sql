CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_whatsapp_connections"
  ON whatsapp_connections
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS whatsapp_report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  projeto_id UUID REFERENCES projetos(id) ON DELETE CASCADE,
  whatsapp_connection_id UUID REFERENCES whatsapp_connections(id) ON DELETE SET NULL,
  destinatario TEXT NOT NULL,
  frequencia TEXT NOT NULL DEFAULT 'daily',
  horario TIME NOT NULL DEFAULT '07:00',
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  metricas TEXT[] NOT NULL DEFAULT '{}',
  mensagem TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE whatsapp_report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_whatsapp_report_schedules"
  ON whatsapp_report_schedules
  FOR ALL
  USING (true)
  WITH CHECK (true);
