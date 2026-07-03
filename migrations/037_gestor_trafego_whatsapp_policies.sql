-- Migration 037: policies de Gestor de Tráfego para WhatsApp
-- PRÉ-REQUISITO: rode 010_whatsapp_reports.sql primeiro (cria as tabelas
-- whatsapp_connections e whatsapp_report_schedules). Essas tabelas não
-- existiam ainda quando 036 foi criada, então essa parte foi separada.
--
-- Rollback:
--   DROP POLICY IF EXISTS "shared users manage whatsapp_report_schedules" ON public.whatsapp_report_schedules;
--   DROP POLICY IF EXISTS "admin manages whatsapp_connections" ON public.whatsapp_connections;
--   CREATE POLICY "authenticated users access whatsapp_connections"
--     ON public.whatsapp_connections FOR ALL
--     USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ─── whatsapp_report_schedules: viewers podem configurar relatórios ────────

DROP POLICY IF EXISTS "shared users manage whatsapp_report_schedules" ON public.whatsapp_report_schedules;
CREATE POLICY "shared users manage whatsapp_report_schedules"
  ON public.whatsapp_report_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = whatsapp_report_schedules.projeto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_dashboard_permissions udp
      WHERE udp.projeto_id = whatsapp_report_schedules.projeto_id
        AND udp.user_id = auth.uid()
        AND udp.pode_visualizar = true
    )
  );

-- ─── whatsapp_connections: fecha para "qualquer autenticado", abre só admin ─
-- Achado de segurança: qualquer usuário logado conseguiria ler access_token e
-- evolution_api_key de todos os projetos. Corrige para: só admin (dono).
-- A tela de Relatórios do gestor nunca lê esta tabela diretamente — usa a
-- rota /api/relatorios/connection-id (service role) para obter só o ID.

DROP POLICY IF EXISTS "authenticated users access whatsapp_connections" ON public.whatsapp_connections;
DROP POLICY IF EXISTS "allow_all_whatsapp_connections" ON public.whatsapp_connections;
DROP POLICY IF EXISTS "admin manages whatsapp_connections" ON public.whatsapp_connections;

CREATE POLICY "admin manages whatsapp_connections"
  ON public.whatsapp_connections FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );
