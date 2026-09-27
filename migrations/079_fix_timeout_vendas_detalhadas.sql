-- Migration 079: corrige timeout em get_vendas_detalhadas (078).
--
-- Bug real em produção (27/09/2026, minutos depois de ir ao ar): "Meu projeto
-- inglês só fica dando erro ao atualizar" — a versão da 078 fazia
-- `vendas v LEFT JOIN allowed a ON a.hotmart_id = v.hotmart_produto_id` com o
-- filtro de data_venda solto (sem exigir hotmart_produto_id específico), o
-- que forçava o Postgres a escanear TODA a `vendas` (todos os produtos, todos
-- os idiomas/projetos) dentro do intervalo de datas antes de descobrir quais
-- linhas pertenciam a este projeto — diferente da busca crua antiga
-- (`.in('hotmart_produto_id', hotmartIds)`), que filtrava pelos ~10 produtos
-- do projeto PRIMEIRO via índice, um recorte muito menor. Pra recentVendas
-- (sem p_from/p_to) isso virava scan da tabela inteira sem filtro nenhum de
-- data — pior ainda. Resultado: estoura statement_timeout (erro 57014).
--
-- Fix: divide em 3 buscas independentes que cada uma consegue usar índice
-- (idx_vendas_produto_status_data / idx_vendas_produto_data pros produtos do
-- projeto, os 2 índices parciais de atribuição pra atribuídas) e só depois
-- junta e ordena — exatamente a mesma forma de filtrar da busca crua antiga,
-- só que agora somando o ramo de atribuição manual.
CREATE OR REPLACE FUNCTION public.get_vendas_detalhadas(
  p_projeto_id uuid,
  p_from timestamp with time zone DEFAULT NULL,
  p_to timestamp with time zone DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_cursor_data timestamp with time zone DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit int DEFAULT 1000
)
 RETURNS TABLE(
   id uuid, hotmart_id text, hotmart_produto_id text, produto text, oferta_codigo text, oferta_nome text,
   oferta_descricao text, oferta_preco numeric, oferta_moeda text, plano_id text, plano_nome text,
   comprador_nome text, comprador_email text, valor numeric, valor_recebido numeric, valor_bruto numeric,
   taxa_hotmart numeric, comissao_produtor numeric, comissao_coprodutor numeric, comissao_afiliado numeric,
   valor_operacional_final numeric, moeda text, status text, data_venda timestamp with time zone, forma_pagamento text,
   pais text, origem text, afiliado_nome text
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH allowed_all AS (
    SELECT pr.hotmart_id
    FROM projeto_produtos pp
    JOIN produtos pr ON pr.id = pp.produto_id
    WHERE pp.projeto_id = p_projeto_id AND pp.todas_ofertas IS DISTINCT FROM false
  ),
  allowed_ofertas AS (
    SELECT pr.hotmart_id, ppo.oferta_codigo
    FROM projeto_produto_ofertas ppo
    JOIN produtos pr ON pr.id = ppo.produto_id
    WHERE ppo.projeto_id = p_projeto_id
  ),
  -- As 3 CTEs abaixo são uma partição sem sobreposição (cada venda cai em
  -- exatamente uma) — por isso dá pra usar UNION ALL em vez de UNION.
  -- UNION (distinct) forçaria o Postgres a materializar/ordenar TODO o
  -- histórico do projeto antes de aplicar o LIMIT; UNION ALL deixa cada
  -- ramo entrar direto num Merge Append (cada um já varre por índice na
  -- ordem certa) e parar assim que junta `p_limit` linhas — é o que faz a
  -- página 1 de um projeto grande responder em ~100ms em vez de alguns
  -- segundos.
  natural_all AS (
    SELECT v.*
    FROM vendas v
    WHERE v.hotmart_produto_id IN (SELECT hotmart_id FROM allowed_all)
      AND v.projeto_atribuido_id IS NULL
      AND v.projeto_atribuido_extra_id IS DISTINCT FROM p_projeto_id
      AND (p_from IS NULL OR v.data_venda >= p_from)
      AND (p_to IS NULL OR v.data_venda < p_to)
      AND (p_status IS NULL OR v.status = p_status)
  ),
  natural_ofertas AS (
    SELECT v.*
    FROM vendas v
    JOIN allowed_ofertas ao ON ao.hotmart_id = v.hotmart_produto_id AND ao.oferta_codigo = v.oferta_codigo
    WHERE v.projeto_atribuido_id IS NULL
      AND v.projeto_atribuido_extra_id IS DISTINCT FROM p_projeto_id
      AND v.hotmart_produto_id NOT IN (SELECT hotmart_id FROM allowed_all)
      AND (p_from IS NULL OR v.data_venda >= p_from)
      AND (p_to IS NULL OR v.data_venda < p_to)
      AND (p_status IS NULL OR v.status = p_status)
  ),
  atribuidas AS (
    SELECT v.*
    FROM vendas v
    WHERE (v.projeto_atribuido_id = p_projeto_id OR v.projeto_atribuido_extra_id = p_projeto_id)
      AND (p_from IS NULL OR v.data_venda >= p_from)
      AND (p_to IS NULL OR v.data_venda < p_to)
      AND (p_status IS NULL OR v.status = p_status)
  ),
  combined AS (
    SELECT * FROM natural_all
    UNION ALL
    SELECT * FROM natural_ofertas
    UNION ALL
    SELECT * FROM atribuidas
  )
  SELECT id, hotmart_id, hotmart_produto_id, produto, oferta_codigo, oferta_nome,
         oferta_descricao, oferta_preco, oferta_moeda, plano_id, plano_nome,
         comprador_nome, comprador_email, valor, valor_recebido, valor_bruto,
         taxa_hotmart, comissao_produtor, comissao_coprodutor, comissao_afiliado,
         valor_operacional_final, moeda, status, data_venda, forma_pagamento,
         pais, origem, afiliado_nome
  FROM combined
  WHERE (
    p_cursor_data IS NULL
    OR data_venda < p_cursor_data
    OR (data_venda = p_cursor_data AND id < p_cursor_id)
  )
  ORDER BY data_venda DESC, id DESC
  LIMIT p_limit;
$function$;
