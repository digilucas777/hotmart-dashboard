-- Migration 033: Habilita RLS em todas as tabelas públicas sem proteção
-- e corrige policies permissivas (USING true) existentes.
--
-- Service role bypassa RLS automaticamente no Supabase — webhooks e rotas
-- de servidor que usam SUPABASE_SERVICE_ROLE_KEY não precisam de policies.

-- ─── projetos ─────────────────────────────────────────────────────────────────
-- Tem coluna user_id desde migration 022; só precisa de RLS + policy.

ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own projetos"
  ON public.projetos FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── projeto_produtos ─────────────────────────────────────────────────────────

ALTER TABLE public.projeto_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own projeto_produtos"
  ON public.projeto_produtos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projetos
      WHERE projetos.id = projeto_produtos.projeto_id
        AND projetos.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projetos
      WHERE projetos.id = projeto_produtos.projeto_id
        AND projetos.user_id = auth.uid()
    )
  );

-- ─── produtos ─────────────────────────────────────────────────────────────────
-- Sem user_id direto; acesso via projeto_produtos → projetos.user_id.
-- SELECT apenas: inserção/atualização feita pelo webhook (service role).

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own produtos"
  ON public.produtos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projeto_produtos pp
      JOIN public.projetos pr ON pr.id = pp.projeto_id
      WHERE pp.produto_id = produtos.id
        AND pr.user_id = auth.uid()
    )
  );

-- ─── vendas ───────────────────────────────────────────────────────────────────
-- Sem user_id direto; acesso via hotmart_produto_id → produtos.hotmart_id
-- → projeto_produtos → projetos.user_id.
-- SELECT + UPDATE: webhook faz INSERT via service role; client pode atualizar
-- campo 'origem' via fetchHotmartOrigens.

ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own vendas"
  ON public.vendas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.projeto_produtos pp ON pp.produto_id = p.id
      JOIN public.projetos pr ON pr.id = pp.projeto_id
      WHERE p.hotmart_id = vendas.hotmart_produto_id
        AND pr.user_id = auth.uid()
    )
  );

CREATE POLICY "users update own vendas"
  ON public.vendas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.projeto_produtos pp ON pp.produto_id = p.id
      JOIN public.projetos pr ON pr.id = pp.projeto_id
      WHERE p.hotmart_id = vendas.hotmart_produto_id
        AND pr.user_id = auth.uid()
    )
  );

-- ─── projeto_produto_ofertas ──────────────────────────────────────────────────

ALTER TABLE public.projeto_produto_ofertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own projeto_produto_ofertas"
  ON public.projeto_produto_ofertas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projetos
      WHERE projetos.id = projeto_produto_ofertas.projeto_id
        AND projetos.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projetos
      WHERE projetos.id = projeto_produto_ofertas.projeto_id
        AND projetos.user_id = auth.uid()
    )
  );

-- ─── hotmart_coproducer_backfill ──────────────────────────────────────────────
-- Tabela interna de backfill; sem acesso direto pelo cliente.
-- Sem policies = apenas service role.

ALTER TABLE public.hotmart_coproducer_backfill ENABLE ROW LEVEL SECURITY;

-- ─── Corrige dashboard_widgets (USING true → ownership check) ─────────────────

DROP POLICY IF EXISTS "allow_all_dashboard_widgets" ON public.dashboard_widgets;

CREATE POLICY "users manage own dashboard_widgets"
  ON public.dashboard_widgets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projetos
      WHERE projetos.id = dashboard_widgets.projeto_id
        AND projetos.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projetos
      WHERE projetos.id = dashboard_widgets.projeto_id
        AND projetos.user_id = auth.uid()
    )
  );

-- ─── Corrige whatsapp_report_schedules (USING true → ownership check) ─────────

DROP POLICY IF EXISTS "allow_all_whatsapp_report_schedules" ON public.whatsapp_report_schedules;

CREATE POLICY "users manage own whatsapp_report_schedules"
  ON public.whatsapp_report_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projetos
      WHERE projetos.id = whatsapp_report_schedules.projeto_id
        AND projetos.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projetos
      WHERE projetos.id = whatsapp_report_schedules.projeto_id
        AND projetos.user_id = auth.uid()
    )
  );

-- ─── Corrige whatsapp_connections (USING true → apenas autenticados) ──────────
-- Tabela sem coluna user_id; mantém acesso para usuários autenticados
-- enquanto bloqueia acesso anônimo/público.

DROP POLICY IF EXISTS "allow_all_whatsapp_connections" ON public.whatsapp_connections;

CREATE POLICY "authenticated users access whatsapp_connections"
  ON public.whatsapp_connections FOR ALL
  USING  (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
