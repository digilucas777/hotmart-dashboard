-- Migration 043: notificacoes push de vendas
--
-- push_subscriptions: um registro por navegador/aparelho que autorizou
-- notificacao. So um "endereco de entrega" — cada usuario gerencia so o
-- proprio, sem necessidade de acesso admin (ninguem precisa navegar pelas
-- inscricoes de outra pessoa).
--
-- notification_preferences: um registro por (user_id, projeto_id), com uma
-- coluna booleana por tipo de evento. Tudo comeca desligado (opt-in) porque
-- notificacao push e intrusiva — marcar "este projeto" na tela nao deveria
-- silenciosamente ligar 6 tipos de aviso que a pessoa nunca pediu.

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user manages own subscriptions"
  ON public.push_subscriptions FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  venda_realizada boolean NOT NULL DEFAULT false,
  boleto_gerado boolean NOT NULL DEFAULT false,
  pix_gerado boolean NOT NULL DEFAULT false,
  vendas_pendentes boolean NOT NULL DEFAULT false,
  reembolso boolean NOT NULL DEFAULT false,
  venda_cancelada boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, projeto_id)
);

CREATE INDEX notification_preferences_projeto_id_idx ON public.notification_preferences(projeto_id);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user manages own preferences"
  ON public.notification_preferences FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Visibilidade de admin mantida por completude/futuras telas de auditoria
-- (barato de ter via is_admin(), mesmo que nada use isso ainda).
CREATE POLICY "admin sees all preferences"
  ON public.notification_preferences FOR SELECT
  USING (public.is_admin());
