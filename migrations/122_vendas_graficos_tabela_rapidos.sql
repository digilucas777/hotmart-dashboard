-- Substitui as funções da 120 (que devolviam a venda inteira e levavam 12s+) por
-- vendas_do_projeto_leve (só as colunas do índice idx_vendas_graficos). A versão final de
-- vendas_do_projeto_leve está na 123 (acesso conferido uma vez por busca).
-- oferta_sufixo também foi reescrita sem "set search_path" pro Postgres conseguir
-- embutir na busca (6s a menos em 49 mil vendas) e com atalho pra produto comum.
drop function if exists public.get_vendas_tabela(uuid, timestamptz, timestamptz, text[], text[], int, timestamptz, uuid);
drop function if exists public.get_vendas_graficos(uuid, timestamptz, timestamptz, text[], text[]);
drop function if exists public.vendas_do_projeto(uuid, timestamptz, timestamptz, text[], text[]);
-- (corpo aplicado no banco em 12/11/2026: oferta_sufixo sem search_path, get_vendas_graficos
-- sobre vendas_do_projeto_leve com CTE materialized, get_vendas_tabela que acha os 250 ids
-- pelo índice e só então abre as 250 vendas. Ver pg_get_functiondef no banco.)
