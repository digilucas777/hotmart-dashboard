-- Migration 083: consolida as 3 políticas de SELECT em `vendas` numa só.
--
-- Achado em 28/09/2026, investigando timeout persistente que sobreviveu a
-- TODAS as tentativas de correção anteriores (078-082) — inclusive em
-- funções que nunca foram tocadas hoje (get_distinct_afiliados_v2,
-- get_distinct_origens_v2) e na busca crua antiga de `vendas`, que é
-- estável há meses. Causa: `vendas` tem 3 políticas RLS permissivas de
-- SELECT empilhadas ("admin sees all vendas", "shared users select vendas",
-- "users see own vendas") — o Postgres tem que rodar as 3 (cada uma com um
-- EXISTS + JOIN em produtos/projeto_produtos/user_dashboard_permissions ou
-- projetos) pra CADA linha candidata, em vez de uma só. Isso nunca apareceu
-- nos meus testes porque eu sempre rodava como `postgres` (superuser),
-- que ignora RLS completamente — a dashboard real passa por PostgREST como
-- `authenticated`/`anon`, pagando o custo total. Confirmado no advisor de
-- performance do Supabase ("Multiple Permissive Policies", nome
-- multiple_permissive_policies) — provavelmente pré-existente, não
-- introduzido pelas mudanças de hoje, só nunca tinha "estourado" antes.
--
-- Fix: uma política SELECT só, com is_admin() primeiro (barato, sem
-- subquery — a maioria das consultas de admin já resolve aqui e nem chega a
-- rodar os EXISTS caros) e as duas condições de usuário comum depois, via
-- OR. Mesmo acesso de antes (confirmado com Lucas antes de aplicar), mas o
-- Postgres avalia uma vez só por linha em vez de três.

DROP POLICY IF EXISTS "admin sees all vendas" ON public.vendas;
DROP POLICY IF EXISTS "shared users select vendas" ON public.vendas;
DROP POLICY IF EXISTS "users see own vendas" ON public.vendas;

CREATE POLICY "select vendas (consolidada)" ON public.vendas
FOR SELECT
USING (
  is_admin()
  OR EXISTS (
    SELECT 1
    FROM produtos p
      JOIN projeto_produtos pp ON pp.produto_id = p.id
      JOIN projetos pr ON pr.id = pp.projeto_id
    WHERE p.hotmart_id = vendas.hotmart_produto_id
      AND pr.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM produtos p
      JOIN projeto_produtos pp ON pp.produto_id = p.id
      JOIN user_dashboard_permissions udp ON udp.projeto_id = pp.projeto_id
    WHERE p.hotmart_id = vendas.hotmart_produto_id
      AND udp.user_id = (SELECT auth.uid())
      AND udp.pode_visualizar = true
      AND (udp.dados_visiveis_a_partir IS NULL OR vendas.data_venda >= udp.dados_visiveis_a_partir)
  )
);
