-- Migration 042: log de acessos a dashboards
-- Objetivo: o admin quer saber quando cada usuário (principalmente
-- convidados/Gestor de Tráfego) acessou qual dashboard.
--
-- Sem IP/user-agent: o insert é feito direto do navegador (não existe
-- middleware/rota de servidor no caminho), então um IP vindo do cliente não
-- é confiável — evita dado enganoso. Guarda só quem, qual projeto e quando.
--
-- projeto_nome é congelado no momento do acesso (denormalizado) — evita
-- join na rota do admin e preserva o nome histórico caso o projeto seja
-- renomeado depois (comportamento esperado de um log de auditoria).

CREATE TABLE IF NOT EXISTS public.dashboard_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  projeto_nome text NOT NULL,
  acessado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dashboard_access_log_user_id_idx ON public.dashboard_access_log(user_id);
CREATE INDEX IF NOT EXISTS dashboard_access_log_projeto_id_idx ON public.dashboard_access_log(projeto_id);
CREATE INDEX IF NOT EXISTS dashboard_access_log_acessado_em_idx ON public.dashboard_access_log(acessado_em DESC);

ALTER TABLE public.dashboard_access_log ENABLE ROW LEVEL SECURITY;

-- Somente-inserção: cada usuário só grava o próprio acesso (sem UPDATE/DELETE
-- pra ninguém além de service role — é assim que um log de auditoria deve
-- se comportar).
DROP POLICY IF EXISTS "users insert own access log" ON public.dashboard_access_log;
CREATE POLICY "users insert own access log"
  ON public.dashboard_access_log FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users see own access log" ON public.dashboard_access_log;
CREATE POLICY "users see own access log"
  ON public.dashboard_access_log FOR SELECT
  USING ((select auth.uid()) = user_id);

-- Admin vê tudo, usando a função SECURITY DEFINER já existente (migration 041)
-- pra evitar qualquer risco de recursão.
DROP POLICY IF EXISTS "admin sees all access log" ON public.dashboard_access_log;
CREATE POLICY "admin sees all access log"
  ON public.dashboard_access_log FOR SELECT
  USING (public.is_admin());
