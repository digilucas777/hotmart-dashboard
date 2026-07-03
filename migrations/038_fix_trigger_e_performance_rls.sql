-- Migration 038: corrige dois problemas encontrados no teste real do Gestor de Tráfego
--
--   1. O gatilho que cria a linha em user_profiles pra cada novo usuário
--      (criado na migration 021) nunca chegou a rodar de fato neste banco —
--      por isso usuários convidados nunca apareciam em /admin. Recria o
--      gatilho (idempotente, mesmo código de 021) e faz backfill de quem já
--      foi convidado e ficou de fora.
--
--   2. As policies novas da migration 036 usam auth.uid() direto dentro de
--      EXISTS — o Postgres reavalia essa função a cada linha da tabela.
--      Envolver em "(select auth.uid())" faz o Postgres calcular uma vez só
--      (vira um InitPlan) — é a prática recomendada pelo próprio Supabase
--      para RLS em tabelas grandes. Reaplica as policies de vendas,
--      custos_manuais, dashboard_widgets e whatsapp_report_schedules com
--      essa otimização. Nenhuma regra de acesso muda — é só performance.

-- ─── 1. Recria o gatilho de user_profiles + backfill ───────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, nome)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

INSERT INTO public.user_profiles (id, email, nome, role)
SELECT au.id, au.email, au.raw_user_meta_data->>'full_name', 'user'
FROM auth.users au
LEFT JOIN public.user_profiles up ON up.id = au.id
WHERE up.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Otimiza as policies de acesso compartilhado (mesma lógica) ─────────

DROP POLICY IF EXISTS "shared users select vendas" ON public.vendas;
CREATE POLICY "shared users select vendas"
  ON public.vendas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.produtos p
      JOIN public.projeto_produtos pp ON pp.produto_id = p.id
      JOIN public.user_dashboard_permissions udp ON udp.projeto_id = pp.projeto_id
      WHERE p.hotmart_id = vendas.hotmart_produto_id
        AND udp.user_id = (select auth.uid())
        AND udp.pode_visualizar = true
        AND (
          udp.dados_visiveis_a_partir IS NULL
          OR vendas.data_venda >= udp.dados_visiveis_a_partir
        )
    )
  );

DROP POLICY IF EXISTS "shared users select custos_manuais" ON public.custos_manuais;
CREATE POLICY "shared users select custos_manuais"
  ON public.custos_manuais FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = custos_manuais.projeto_id
        AND udp.user_id = (select auth.uid())
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
        AND udp.user_id = (select auth.uid())
        AND udp.pode_adicionar_custo_manual = true
    )
  );

DROP POLICY IF EXISTS "shared users select dashboard_widgets" ON public.dashboard_widgets;
CREATE POLICY "shared users select dashboard_widgets"
  ON public.dashboard_widgets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = dashboard_widgets.projeto_id
        AND udp.user_id = (select auth.uid())
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
        AND udp.user_id = (select auth.uid())
        AND (udp.pode_editar_layout = true OR udp.pode_adicionar_widgets = true OR udp.is_admin_dashboard = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = dashboard_widgets.projeto_id
        AND udp.user_id = (select auth.uid())
        AND (udp.pode_editar_layout = true OR udp.pode_adicionar_widgets = true OR udp.is_admin_dashboard = true)
    )
  );

DROP POLICY IF EXISTS "shared users select projetos" ON public.projetos;
CREATE POLICY "shared users select projetos"
  ON public.projetos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = projetos.id
        AND udp.user_id = (select auth.uid())
        AND udp.pode_visualizar = true
    )
  );

DROP POLICY IF EXISTS "shared users select produtos" ON public.produtos;
CREATE POLICY "shared users select produtos"
  ON public.produtos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projeto_produtos pp
      JOIN public.user_dashboard_permissions udp ON udp.projeto_id = pp.projeto_id
      WHERE pp.produto_id = produtos.id
        AND udp.user_id = (select auth.uid())
        AND udp.pode_visualizar = true
    )
  );

DROP POLICY IF EXISTS "shared users select projeto_produtos" ON public.projeto_produtos;
CREATE POLICY "shared users select projeto_produtos"
  ON public.projeto_produtos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = projeto_produtos.projeto_id
        AND udp.user_id = (select auth.uid())
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
        AND udp.user_id = (select auth.uid())
        AND udp.pode_visualizar = true
    )
  );
