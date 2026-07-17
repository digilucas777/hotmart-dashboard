-- Migration 053: admin (master) enxerga toda venda, mesmo de produto ainda
-- não vinculado a nenhum projeto
--
-- Hoje `vendas` não tem nenhuma policy de bypass pra admin (só existe pra
-- user_profiles, notified_sale_events, etc) — a visibilidade do admin
-- funciona só por coincidência, porque ele é dono (projetos.user_id) da
-- maioria dos projetos. Pra uma venda de um produto ainda sem vínculo
-- nenhum em projeto_produtos, nem o admin consegue ver a linha, porque a
-- policy "users see own vendas" depende desse vínculo existir.
--
-- Isso quebra o fluxo desejado: o master quer que TODA venda das contas
-- Hotmart apareça na aba Vendas pra ele acompanhar e vincular o produto a
-- um projeto depois — inclusive vendas de produtos ainda não configurados.
-- Mesmo padrão já usado em notified_sale_events (migration 045).
DROP POLICY IF EXISTS "admin sees all vendas" ON public.vendas;
CREATE POLICY "admin sees all vendas" ON public.vendas
  FOR SELECT USING (public.is_admin());
