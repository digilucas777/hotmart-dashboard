-- Migration 036: permissões do "Gestor de Tráfego" + correções de RLS
-- Contexto: user_dashboard_permissions existia mas não era respeitada pelas
-- policies de RLS (só o dono do projeto tinha acesso). Esta migration:
--   1. adiciona as colunas novas de permissão;
--   2. adiciona policies extras (somativas, não substituem as existentes)
--      para liberar acesso a quem tem uma linha em user_dashboard_permissions.
--
-- As policies de whatsapp_connections/whatsapp_report_schedules foram
-- movidas para 037_gestor_trafego_whatsapp_policies.sql porque essas tabelas
-- ainda não existem neste banco (a integração de WhatsApp não foi
-- configurada) — rode a migration 037 só depois de criar essas tabelas
-- (migration 010_whatsapp_reports.sql) quando for ativar WhatsApp.
--
-- Rollback:
--   ALTER TABLE public.user_dashboard_permissions DROP COLUMN IF EXISTS pode_ver_vendas;
--   ALTER TABLE public.user_dashboard_permissions DROP COLUMN IF EXISTS pode_adicionar_custo_manual;
--   ALTER TABLE public.user_dashboard_permissions DROP COLUMN IF EXISTS pode_ver_conexao_whatsapp;
--   ALTER TABLE public.user_dashboard_permissions DROP COLUMN IF EXISTS dados_visiveis_a_partir;
--   DROP POLICY IF EXISTS "shared users select projetos" ON public.projetos;
--   DROP POLICY IF EXISTS "shared users select produtos" ON public.produtos;
--   DROP POLICY IF EXISTS "shared users select projeto_produtos" ON public.projeto_produtos;
--   DROP POLICY IF EXISTS "shared users select projeto_produto_ofertas" ON public.projeto_produto_ofertas;
--   DROP POLICY IF EXISTS "shared users select vendas" ON public.vendas;
--   DROP POLICY IF EXISTS "shared users select custos_manuais" ON public.custos_manuais;
--   DROP POLICY IF EXISTS "shared users insert custos_manuais" ON public.custos_manuais;
--   DROP POLICY IF EXISTS "shared users select dashboard_widgets" ON public.dashboard_widgets;
--   DROP POLICY IF EXISTS "shared users edit dashboard_widgets" ON public.dashboard_widgets;

-- ─── Novas colunas ──────────────────────────────────────────────────────────

ALTER TABLE public.user_dashboard_permissions
  ADD COLUMN IF NOT EXISTS pode_ver_vendas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pode_adicionar_custo_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pode_ver_conexao_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dados_visiveis_a_partir date;

-- ─── projetos: liberar SELECT para quem tem permissão compartilhada ────────

DROP POLICY IF EXISTS "shared users select projetos" ON public.projetos;
CREATE POLICY "shared users select projetos"
  ON public.projetos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = projetos.id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
    )
  );

-- ─── produtos: liberar SELECT para quem tem permissão compartilhada ────────

DROP POLICY IF EXISTS "shared users select produtos" ON public.produtos;
CREATE POLICY "shared users select produtos"
  ON public.produtos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projeto_produtos pp
      JOIN public.user_dashboard_permissions udp ON udp.projeto_id = pp.projeto_id
      WHERE pp.produto_id = produtos.id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
    )
  );

-- ─── projeto_produtos / projeto_produto_ofertas: SELECT para viewers ───────

DROP POLICY IF EXISTS "shared users select projeto_produtos" ON public.projeto_produtos;
CREATE POLICY "shared users select projeto_produtos"
  ON public.projeto_produtos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = projeto_produtos.projeto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
    )
  );

DROP POLICY IF EXISTS "shared users select projeto_produto_ofertas" ON public.projeto_produto_ofertas;
CREATE POLICY "shared users select projeto_produto_ofertas"
  ON public.projeto_produto_ofertas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = projeto_produto_ofertas.projeto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
    )
  );

-- ─── vendas: SELECT para viewers, com corte de data ────────────────────────

DROP POLICY IF EXISTS "shared users select vendas" ON public.vendas;
CREATE POLICY "shared users select vendas"
  ON public.vendas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.projeto_produtos pp ON pp.produto_id = p.id
      JOIN public.user_dashboard_permissions udp ON udp.projeto_id = pp.projeto_id
      WHERE p.hotmart_id = vendas.hotmart_produto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
        AND (
          udp.dados_visiveis_a_partir IS NULL
          OR vendas.data_venda >= udp.dados_visiveis_a_partir
        )
    )
  );

-- ─── custos_manuais: SELECT com corte de data + INSERT dedicado ───────────

DROP POLICY IF EXISTS "shared users select custos_manuais" ON public.custos_manuais;
CREATE POLICY "shared users select custos_manuais"
  ON public.custos_manuais FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = custos_manuais.projeto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
        AND (
          udp.dados_visiveis_a_partir IS NULL
          OR custos_manuais.data >= udp.dados_visiveis_a_partir
        )
    )
  );

DROP POLICY IF EXISTS "shared users insert custos_manuais" ON public.custos_manuais;
CREATE POLICY "shared users insert custos_manuais"
  ON public.custos_manuais FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = custos_manuais.projeto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_adicionar_custo_manual = true
    )
  );

-- ─── dashboard_widgets: SELECT para viewers, escrita para editores ─────────

DROP POLICY IF EXISTS "shared users select dashboard_widgets" ON public.dashboard_widgets;
CREATE POLICY "shared users select dashboard_widgets"
  ON public.dashboard_widgets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = dashboard_widgets.projeto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
    )
  );

DROP POLICY IF EXISTS "shared users edit dashboard_widgets" ON public.dashboard_widgets;
CREATE POLICY "shared users edit dashboard_widgets"
  ON public.dashboard_widgets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = dashboard_widgets.projeto_id
        AND udp.user_id = auth.uid()
        AND (udp.pode_editar_layout = true OR udp.pode_adicionar_widgets = true OR udp.is_admin_dashboard = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = dashboard_widgets.projeto_id
        AND udp.user_id = auth.uid()
        AND (udp.pode_editar_layout = true OR udp.pode_adicionar_widgets = true OR udp.is_admin_dashboard = true)
    )
  );

-- As policies de whatsapp_report_schedules e whatsapp_connections ficam em
-- 037_gestor_trafego_whatsapp_policies.sql — rode depois de criar essas
-- tabelas (migration 010_whatsapp_reports.sql), quando for ativar WhatsApp.
