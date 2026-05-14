-- Recria a tabela configuracoes com id UUID vinculado ao auth.users
-- ATENÇÃO: derruba a tabela anterior (criada em 003) sem dados relevantes

DROP TABLE IF EXISTS public.configuracoes;

CREATE TABLE public.configuracoes (
  id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_empresa       TEXT,
  nome_proprietario  TEXT,
  email              TEXT,
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: cada usuário acessa apenas suas próprias configurações
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_config"
  ON public.configuracoes
  FOR ALL
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- CRIAR USUÁRIO INICIAL
-- ============================================================
-- Use o painel do Supabase: Authentication → Users → Add user
-- Informe e-mail e senha. O usuário receberá acesso imediato.
--
-- Ou via SQL (requer permissão service_role, NÃO rodar com anon):
--   SELECT auth.sign_up('seu@email.com', 'suasenha');
-- ============================================================
