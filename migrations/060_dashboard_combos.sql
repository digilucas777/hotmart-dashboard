-- Migration 060: dashboards combinados (multi-projeto)
--
-- dashboard_combos: uma combinacao salva de projetos (ex: "Europa" =
-- IT+FR+ES) que um usuario quer ver com metricas de vendas somadas. Mesmo
-- padrao de tabela-por-usuario de push_subscriptions/notification_
-- preferences (migration 043) — RLS so garante "cada um ve o proprio",
-- a restricao de admin-only fica na camada de aplicacao (nao na RLS), pra
-- funcionar corretamente por usuario se essa restricao for removida no
-- futuro sem precisar de outra migration.

CREATE TABLE public.dashboard_combos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  projeto_ids uuid[] NOT NULL DEFAULT '{}',
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dashboard_combos_user_id_idx ON public.dashboard_combos(user_id);

ALTER TABLE public.dashboard_combos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user manages own combos"
  ON public.dashboard_combos FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
