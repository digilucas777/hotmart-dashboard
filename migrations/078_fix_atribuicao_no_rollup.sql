-- Migration 078: corrige get_vendas_summary_v2/multi_v2/get_vendas_por_dia
-- (usadas de verdade pela dashboard ao vivo) pra respeitar
-- projeto_atribuido_id/projeto_atribuido_extra_id (migrations 076/077).
--
-- Causa raiz: 076/077 só atualizaram get_vendas_summary — mas a dashboard em
-- produção não chama essa função, chama get_vendas_summary_v2 (e as outras
-- _v2/get_vendas_por_dia), que leem de vendas_resumo_diario (resumo
-- pré-calculado por produto+oferta+dia, sem granularidade de venda
-- individual) em vez de escanear `vendas` linha a linha. Por isso a venda
-- atribuída ao Lucas nunca apareceu na dashboard: o resumo não tem como
-- saber que UMA venda específica de um produto foi reatribuída.
--
-- Fix: mantém o resumo pré-calculado como caminho rápido (cobre 99.9%+ das
-- vendas, que nunca têm atribuição manual), e soma por cima uma correção
-- pontual direto em `vendas`, filtrando só as poucas linhas que têm
-- projeto_atribuido_id OU projeto_atribuido_extra_id preenchido (índices
-- parciais já existentes, migrations 076/077 — hoje são 2 linhas no banco
-- inteiro). Pra qualquer projeto/produto sem nenhuma venda atribuída
-- manualmente essa correção é sempre vazia, então o número final não muda
-- em nada (validado comparando ES/FR/DE/IT antes e depois de aplicar).
--
-- Mesma lógica de 3 ramos do get_vendas_summary original (076/077):
--   1) projeto_atribuido_id = p_projeto_id            -> soma aqui (exclusivo)
--   2) projeto_atribuido_extra_id = p_projeto_id      -> soma aqui também (aditivo)
--   3) projeto_atribuido_id IS NULL E produto natural  -> conta no natural (resumo já faz isso)
-- Como o resumo (ramo 3) sempre inclui a venda no natural mesmo quando ela
-- tem projeto_atribuido_id setado pra OUTRO projeto (o resumo não sabe
-- distinguir), a correção também SUBTRAI do natural qualquer venda com
-- projeto_atribuido_id preenchido (não IS NULL) que o resumo já contou.

CREATE OR REPLACE FUNCTION public.get_vendas_summary_v2(p_projeto_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(status text, moeda text, cnt bigint, total numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT pr.hotmart_id, pp.todas_ofertas
    FROM projeto_produtos pp
    JOIN produtos pr ON pr.id = pp.produto_id
    WHERE pp.projeto_id = p_projeto_id
  ),
  allowed_ofertas AS (
    SELECT pr.hotmart_id, ppo.oferta_codigo
    FROM projeto_produto_ofertas ppo
    JOIN produtos pr ON pr.id = ppo.produto_id
    WHERE ppo.projeto_id = p_projeto_id
  ),
  rollup AS (
    SELECT r.status, r.moeda, r.cnt, r.total
    FROM vendas_resumo_diario r
    JOIN allowed a ON a.hotmart_id = r.hotmart_produto_id
    WHERE r.data >= (p_from at time zone 'America/Sao_Paulo')::date
      AND r.data <= ((p_to - interval '1 second') at time zone 'America/Sao_Paulo')::date
      AND (
        a.todas_ofertas IS DISTINCT FROM false
        OR EXISTS (
          SELECT 1 FROM allowed_ofertas ao
          WHERE ao.hotmart_id = r.hotmart_produto_id AND ao.oferta_codigo = r.oferta_codigo
        )
      )
  ),
  venda_overrides AS (
    SELECT v.status, v.moeda, v.valor_operacional_final,
      (
        a.hotmart_id IS NOT NULL
        AND (
          a.todas_ofertas IS DISTINCT FROM false
          OR EXISTS (
            SELECT 1 FROM allowed_ofertas ao
            WHERE ao.hotmart_id = v.hotmart_produto_id AND ao.oferta_codigo = v.oferta_codigo
          )
        )
      ) AS natural_match,
      v.projeto_atribuido_id, v.projeto_atribuido_extra_id
    FROM vendas v
    LEFT JOIN allowed a ON a.hotmart_id = v.hotmart_produto_id
    WHERE v.data_venda >= p_from AND v.data_venda < p_to
      AND (v.projeto_atribuido_id IS NOT NULL OR v.projeto_atribuido_extra_id IS NOT NULL)
  ),
  combined AS (
    SELECT status, moeda, cnt, total FROM rollup
    UNION ALL
    SELECT status, moeda, -1, -valor_operacional_final FROM venda_overrides WHERE natural_match AND projeto_atribuido_id IS NOT NULL
    UNION ALL
    SELECT status, moeda, 1, valor_operacional_final FROM venda_overrides WHERE projeto_atribuido_id = p_projeto_id
    UNION ALL
    SELECT status, moeda, 1, valor_operacional_final FROM venda_overrides WHERE projeto_atribuido_extra_id = p_projeto_id
  )
  SELECT status, moeda, sum(cnt)::bigint AS cnt, coalesce(sum(total), 0) AS total
  FROM combined
  GROUP BY status, moeda;
$function$;

CREATE OR REPLACE FUNCTION public.get_vendas_summary_multi_v2(p_projeto_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(projeto_id uuid, status text, moeda text, cnt bigint, total numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT pp.projeto_id, pr.hotmart_id, pp.todas_ofertas
    FROM projeto_produtos pp
    JOIN produtos pr ON pr.id = pp.produto_id
    WHERE pp.projeto_id = ANY(p_projeto_ids)
  ),
  allowed_ofertas AS (
    SELECT ppo.projeto_id, pr.hotmart_id, ppo.oferta_codigo
    FROM projeto_produto_ofertas ppo
    JOIN produtos pr ON pr.id = ppo.produto_id
    WHERE ppo.projeto_id = ANY(p_projeto_ids)
  ),
  rollup AS (
    SELECT a.projeto_id, r.status, r.moeda, r.cnt, r.total
    FROM vendas_resumo_diario r
    JOIN allowed a ON a.hotmart_id = r.hotmart_produto_id
    WHERE r.data >= (p_from at time zone 'America/Sao_Paulo')::date
      AND r.data <= ((p_to - interval '1 second') at time zone 'America/Sao_Paulo')::date
      AND (
        a.todas_ofertas IS DISTINCT FROM false
        OR EXISTS (
          SELECT 1 FROM allowed_ofertas ao
          WHERE ao.projeto_id = a.projeto_id AND ao.hotmart_id = r.hotmart_produto_id AND ao.oferta_codigo = r.oferta_codigo
        )
      )
  ),
  venda_overrides AS (
    SELECT pid AS projeto_id, v.status, v.moeda, v.valor_operacional_final,
      EXISTS (
        SELECT 1 FROM allowed a
        WHERE a.projeto_id = pid AND a.hotmart_id = v.hotmart_produto_id
          AND (
            a.todas_ofertas IS DISTINCT FROM false
            OR EXISTS (
              SELECT 1 FROM allowed_ofertas ao
              WHERE ao.projeto_id = pid AND ao.hotmart_id = v.hotmart_produto_id AND ao.oferta_codigo = v.oferta_codigo
            )
          )
      ) AS natural_match,
      v.projeto_atribuido_id, v.projeto_atribuido_extra_id
    FROM vendas v
    CROSS JOIN unnest(p_projeto_ids) AS pid
    WHERE v.data_venda >= p_from AND v.data_venda < p_to
      AND (v.projeto_atribuido_id IS NOT NULL OR v.projeto_atribuido_extra_id IS NOT NULL)
      AND (
        v.projeto_atribuido_id = pid
        OR v.projeto_atribuido_extra_id = pid
        OR EXISTS (SELECT 1 FROM allowed a WHERE a.projeto_id = pid AND a.hotmart_id = v.hotmart_produto_id)
      )
  ),
  combined AS (
    SELECT projeto_id, status, moeda, cnt, total FROM rollup
    UNION ALL
    SELECT projeto_id, status, moeda, -1, -valor_operacional_final FROM venda_overrides WHERE natural_match AND projeto_atribuido_id IS NOT NULL
    UNION ALL
    SELECT projeto_id, status, moeda, 1, valor_operacional_final FROM venda_overrides WHERE projeto_atribuido_id = projeto_id
    UNION ALL
    SELECT projeto_id, status, moeda, 1, valor_operacional_final FROM venda_overrides WHERE projeto_atribuido_extra_id = projeto_id
  )
  SELECT projeto_id, status, moeda, sum(cnt)::bigint AS cnt, coalesce(sum(total), 0) AS total
  FROM combined
  GROUP BY projeto_id, status, moeda;
$function$;

CREATE OR REPLACE FUNCTION public.get_vendas_por_dia(p_projeto_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(dia date, status text, moeda text, cnt bigint, total numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT pr.hotmart_id, pp.todas_ofertas
    FROM projeto_produtos pp
    JOIN produtos pr ON pr.id = pp.produto_id
    WHERE pp.projeto_id = p_projeto_id
  ),
  allowed_ofertas AS (
    SELECT pr.hotmart_id, ppo.oferta_codigo
    FROM projeto_produto_ofertas ppo
    JOIN produtos pr ON pr.id = ppo.produto_id
    WHERE ppo.projeto_id = p_projeto_id
  ),
  rollup AS (
    SELECT r.data AS dia, r.status, r.moeda, r.cnt, r.total
    FROM vendas_resumo_diario r
    JOIN allowed a ON a.hotmart_id = r.hotmart_produto_id
    WHERE r.data >= (p_from at time zone 'America/Sao_Paulo')::date
      AND r.data <= ((p_to - interval '1 second') at time zone 'America/Sao_Paulo')::date
      AND (
        a.todas_ofertas IS DISTINCT FROM false
        OR EXISTS (
          SELECT 1 FROM allowed_ofertas ao
          WHERE ao.hotmart_id = r.hotmart_produto_id AND ao.oferta_codigo = r.oferta_codigo
        )
      )
  ),
  venda_overrides AS (
    SELECT (v.data_venda at time zone 'America/Sao_Paulo')::date AS dia,
      v.status, v.moeda, v.valor_operacional_final,
      (
        a.hotmart_id IS NOT NULL
        AND (
          a.todas_ofertas IS DISTINCT FROM false
          OR EXISTS (
            SELECT 1 FROM allowed_ofertas ao
            WHERE ao.hotmart_id = v.hotmart_produto_id AND ao.oferta_codigo = v.oferta_codigo
          )
        )
      ) AS natural_match,
      v.projeto_atribuido_id, v.projeto_atribuido_extra_id
    FROM vendas v
    LEFT JOIN allowed a ON a.hotmart_id = v.hotmart_produto_id
    WHERE v.data_venda >= p_from AND v.data_venda < p_to
      AND (v.projeto_atribuido_id IS NOT NULL OR v.projeto_atribuido_extra_id IS NOT NULL)
  ),
  combined AS (
    SELECT dia, status, moeda, cnt, total FROM rollup
    UNION ALL
    SELECT dia, status, moeda, -1, -valor_operacional_final FROM venda_overrides WHERE natural_match AND projeto_atribuido_id IS NOT NULL
    UNION ALL
    SELECT dia, status, moeda, 1, valor_operacional_final FROM venda_overrides WHERE projeto_atribuido_id = p_projeto_id
    UNION ALL
    SELECT dia, status, moeda, 1, valor_operacional_final FROM venda_overrides WHERE projeto_atribuido_extra_id = p_projeto_id
  )
  SELECT dia, status, moeda, sum(cnt)::bigint AS cnt, coalesce(sum(total), 0) AS total
  FROM combined
  GROUP BY dia, status, moeda;
$function$;

-- Nova RPC: mesma lógica de "quais vendas contam nesse projeto" de
-- get_vendas_summary (linha a linha, sem rollup — precisa das vendas
-- individuais mesmo, não dá pra pré-agregar), só que devolvendo as colunas
-- completas em vez de já somar. Substitui a busca crua
-- `.from('vendas').in('hotmart_produto_id', hotmartIds)` usada pela tabela
-- de Transações, "Últimas vendas" e o gráfico combinado (hoje/ontem) — essas
-- não sabiam nada sobre projeto_atribuido_id/extra_id, por isso a venda
-- atribuída ao Lucas não aparecia na lista mesmo depois do resumo já estar
-- certo. Paginação por cursor (data_venda, id), mesmo padrão já usado no
-- client (DashboardClient.tsx).
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
  WITH allowed AS (
    SELECT pr.hotmart_id, pp.todas_ofertas
    FROM projeto_produtos pp
    JOIN produtos pr ON pr.id = pp.produto_id
    WHERE pp.projeto_id = p_projeto_id
  ),
  allowed_ofertas AS (
    SELECT pr.hotmart_id, ppo.oferta_codigo
    FROM projeto_produto_ofertas ppo
    JOIN produtos pr ON pr.id = ppo.produto_id
    WHERE ppo.projeto_id = p_projeto_id
  )
  SELECT v.id, v.hotmart_id, v.hotmart_produto_id, v.produto, v.oferta_codigo, v.oferta_nome,
         v.oferta_descricao, v.oferta_preco, v.oferta_moeda, v.plano_id, v.plano_nome,
         v.comprador_nome, v.comprador_email, v.valor, v.valor_recebido, v.valor_bruto,
         v.taxa_hotmart, v.comissao_produtor, v.comissao_coprodutor, v.comissao_afiliado,
         v.valor_operacional_final, v.moeda, v.status, v.data_venda, v.forma_pagamento,
         v.pais, v.origem, v.afiliado_nome
  FROM vendas v
  LEFT JOIN allowed a ON a.hotmart_id = v.hotmart_produto_id
  WHERE (p_from IS NULL OR v.data_venda >= p_from)
    AND (p_to IS NULL OR v.data_venda < p_to)
    AND (p_status IS NULL OR v.status = p_status)
    AND (
      (v.projeto_atribuido_id IS NOT NULL AND v.projeto_atribuido_id = p_projeto_id)
      OR (v.projeto_atribuido_extra_id IS NOT NULL AND v.projeto_atribuido_extra_id = p_projeto_id)
      OR (
        v.projeto_atribuido_id IS NULL
        AND a.hotmart_id IS NOT NULL
        AND (
          a.todas_ofertas IS DISTINCT FROM false
          OR EXISTS (
            SELECT 1 FROM allowed_ofertas ao
            WHERE ao.hotmart_id = v.hotmart_produto_id AND ao.oferta_codigo = v.oferta_codigo
          )
        )
      )
    )
    AND (
      p_cursor_data IS NULL
      OR v.data_venda < p_cursor_data
      OR (v.data_venda = p_cursor_data AND v.id < p_cursor_id)
    )
  ORDER BY v.data_venda DESC, v.id DESC
  LIMIT p_limit;
$function$;
