-- Tabela de configurações gerais da conta
-- Usa um único registro com id = 'default' (upsert no app)
CREATE TABLE IF NOT EXISTS public.configuracoes (
  id                 TEXT PRIMARY KEY DEFAULT 'default',
  nome_empresa       TEXT,
  nome_proprietario  TEXT,
  email              TEXT,
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
