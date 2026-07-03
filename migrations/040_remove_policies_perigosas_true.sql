-- Migration 040: remove mais três policies "USING (true)" encontradas numa
-- auditoria completa de pg_policies — nenhuma delas veio de uma migration,
-- foram criadas direto no painel do Supabase e nunca restringiam nada.
--
-- A mais grave: "admin sees all profiles" em user_profiles estava com
-- USING (true) em vez da checagem de admin que a migration 021 sempre
-- pretendeu. Na prática, qualquer usuário autenticado podia ler E EDITAR
-- a tabela inteira de perfis — inclusive mudar o próprio "role" para
-- 'admin' fazendo uma chamada direta à API do Supabase.
--
-- As outras duas (meta_ads_cache, meta_insights_cache) liberavam pra
-- qualquer autenticado o cache de métricas de Meta Ads de qualquer
-- projeto — é essa segunda que explicava o "Gasto Total" aparecendo pro
-- Gestor de Tráfego sem respeitar a data de corte.
--
-- Rollback (não recomendado — eram as versões inseguras):
--   CREATE POLICY "admin sees all profiles" ON public.user_profiles FOR ALL USING (true);
--   CREATE POLICY "users manage own meta ads cache" ON public.meta_ads_cache FOR ALL USING (true);
--   CREATE POLICY "users manage own meta cache" ON public.meta_insights_cache FOR ALL USING (true);

DROP POLICY IF EXISTS "admin sees all profiles" ON public.user_profiles;
CREATE POLICY "admin sees all profiles" ON public.user_profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

DROP POLICY IF EXISTS "users manage own meta ads cache" ON public.meta_ads_cache;
CREATE POLICY "users manage own meta ads cache" ON public.meta_ads_cache
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.projetos
      WHERE projetos.id = meta_ads_cache.projeto_id
        AND projetos.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "users manage own meta cache" ON public.meta_insights_cache;
CREATE POLICY "users manage own meta cache" ON public.meta_insights_cache
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.projetos
      WHERE projetos.id = meta_insights_cache.projeto_id
        AND projetos.user_id = (select auth.uid())
    )
  );
