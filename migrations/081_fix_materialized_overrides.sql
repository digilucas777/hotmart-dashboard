-- Migration 081: corrige de vez a lentidão da correção de atribuição
-- manual (080 melhorou 2 dos 3 ramos, mas "overrides_subtract" ainda
-- escolhia o índice de DATA em vez do índice parcial de atribuição, mesmo
-- com "projeto_atribuido_id IS NOT NULL" como primeira condição).
--
-- Causa raiz (confirmada via EXPLAIN ANALYZE isolado, projeto do Fabrício):
-- overrides_add_exclusive (`projeto_atribuido_id = <uuid literal>`) e
-- overrides_add_extra já usavam Bitmap Index Scan no índice parcial (1
-- buffer hit) — perfeito. Mas overrides_subtract (`projeto_atribuido_id IS
-- NOT NULL` + range de data + EXISTS correlacionado) o Postgres decidiu
-- escanear por idx_vendas_data_venda e filtrar "IS NOT NULL" depois,
-- descartando ~22 mil linhas por chamada (Rows Removed by Filter: 22560,
-- 22400 buffer hits) — o planner trata "IS NOT NULL" com EXISTS junto de
-- forma menos confiável que uma igualdade simples, e escolhe mal mesmo o
-- predicado batendo exatamente com o índice parcial.
--
-- Fix definitivo: força os 3 ramos de correção a serem MATERIALIZED (CTE
-- materializada, Postgres 12+) — impede o planner de "desmontar" a CTE de
-- volta pro plano geral e reconsiderar o índice; ela sempre roda isolada
-- (scan pelo índice parcial, minúsculo) antes de qualquer filtro de data ou
-- EXISTS ser aplicado em cima do resultado já pequeno.

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
  atribuidas_raw AS MATERIALIZED (
    SELECT status, moeda, valor_operacional_final, hotmart_produto_id, oferta_codigo, data_venda,
           projeto_atribuido_id, projeto_atribuido_extra_id
    FROM vendas
    WHERE projeto_atribuido_id IS NOT NULL OR projeto_atribuido_extra_id IS NOT NULL
  ),
  overrides_subtract AS (
    SELECT v.status, v.moeda, v.valor_operacional_final
    FROM atribuidas_raw v
    WHERE v.projeto_atribuido_id IS NOT NULL
      AND v.data_venda >= p_from AND v.data_venda < p_to
      AND EXISTS (
        SELECT 1 FROM allowed a
        WHERE a.hotmart_id = v.hotmart_produto_id
          AND (
            a.todas_ofertas IS DISTINCT FROM false
            OR EXISTS (SELECT 1 FROM allowed_ofertas ao WHERE ao.hotmart_id = v.hotmart_produto_id AND ao.oferta_codigo = v.oferta_codigo)
          )
      )
  ),
  overrides_add_exclusive AS (
    SELECT v.status, v.moeda, v.valor_operacional_final
    FROM atribuidas_raw v
    WHERE v.projeto_atribuido_id = p_projeto_id
      AND v.data_venda >= p_from AND v.data_venda < p_to
  ),
  overrides_add_extra AS (
    SELECT v.status, v.moeda, v.valor_operacional_final
    FROM atribuidas_raw v
    WHERE v.projeto_atribuido_extra_id = p_projeto_id
      AND v.data_venda >= p_from AND v.data_venda < p_to
  ),
  combined AS (
    SELECT status, moeda, cnt, total FROM rollup
    UNION ALL
    SELECT status, moeda, -1, -valor_operacional_final FROM overrides_subtract
    UNION ALL
    SELECT status, moeda, 1, valor_operacional_final FROM overrides_add_exclusive
    UNION ALL
    SELECT status, moeda, 1, valor_operacional_final FROM overrides_add_extra
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
  atribuidas_raw AS MATERIALIZED (
    SELECT status, moeda, valor_operacional_final, hotmart_produto_id, oferta_codigo, data_venda,
           projeto_atribuido_id, projeto_atribuido_extra_id
    FROM vendas
    WHERE projeto_atribuido_id IS NOT NULL OR projeto_atribuido_extra_id IS NOT NULL
  ),
  overrides_subtract_raw AS (
    SELECT status, moeda, valor_operacional_final, hotmart_produto_id, oferta_codigo
    FROM atribuidas_raw
    WHERE projeto_atribuido_id IS NOT NULL
      AND data_venda >= p_from AND data_venda < p_to
  ),
  overrides_add_exclusive_raw AS (
    SELECT projeto_atribuido_id AS projeto_id, status, moeda, valor_operacional_final
    FROM atribuidas_raw
    WHERE projeto_atribuido_id IS NOT NULL
      AND projeto_atribuido_id = ANY(p_projeto_ids)
      AND data_venda >= p_from AND data_venda < p_to
  ),
  overrides_add_extra_raw AS (
    SELECT projeto_atribuido_extra_id AS projeto_id, status, moeda, valor_operacional_final
    FROM atribuidas_raw
    WHERE projeto_atribuido_extra_id IS NOT NULL
      AND projeto_atribuido_extra_id = ANY(p_projeto_ids)
      AND data_venda >= p_from AND data_venda < p_to
  ),
  overrides_subtract AS (
    SELECT a.projeto_id, r.status, r.moeda, r.valor_operacional_final
    FROM overrides_subtract_raw r
    JOIN allowed a ON a.hotmart_id = r.hotmart_produto_id
      AND (
        a.todas_ofertas IS DISTINCT FROM false
        OR EXISTS (SELECT 1 FROM allowed_ofertas ao WHERE ao.projeto_id = a.projeto_id AND ao.hotmart_id = r.hotmart_produto_id AND ao.oferta_codigo = r.oferta_codigo)
      )
  ),
  combined AS (
    SELECT projeto_id, status, moeda, cnt, total FROM rollup
    UNION ALL
    SELECT projeto_id, status, moeda, -1, -valor_operacional_final FROM overrides_subtract
    UNION ALL
    SELECT projeto_id, status, moeda, 1, valor_operacional_final FROM overrides_add_exclusive_raw
    UNION ALL
    SELECT projeto_id, status, moeda, 1, valor_operacional_final FROM overrides_add_extra_raw
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
  atribuidas_raw AS MATERIALIZED (
    SELECT status, moeda, valor_operacional_final, hotmart_produto_id, oferta_codigo, data_venda,
           projeto_atribuido_id, projeto_atribuido_extra_id
    FROM vendas
    WHERE projeto_atribuido_id IS NOT NULL OR projeto_atribuido_extra_id IS NOT NULL
  ),
  overrides_subtract AS (
    SELECT (v.data_venda at time zone 'America/Sao_Paulo')::date AS dia, v.status, v.moeda, v.valor_operacional_final
    FROM atribuidas_raw v
    WHERE v.projeto_atribuido_id IS NOT NULL
      AND v.data_venda >= p_from AND v.data_venda < p_to
      AND EXISTS (
        SELECT 1 FROM allowed a
        WHERE a.hotmart_id = v.hotmart_produto_id
          AND (
            a.todas_ofertas IS DISTINCT FROM false
            OR EXISTS (SELECT 1 FROM allowed_ofertas ao WHERE ao.hotmart_id = v.hotmart_produto_id AND ao.oferta_codigo = v.oferta_codigo)
          )
      )
  ),
  overrides_add_exclusive AS (
    SELECT (v.data_venda at time zone 'America/Sao_Paulo')::date AS dia, v.status, v.moeda, v.valor_operacional_final
    FROM atribuidas_raw v
    WHERE v.projeto_atribuido_id = p_projeto_id
      AND v.data_venda >= p_from AND v.data_venda < p_to
  ),
  overrides_add_extra AS (
    SELECT (v.data_venda at time zone 'America/Sao_Paulo')::date AS dia, v.status, v.moeda, v.valor_operacional_final
    FROM atribuidas_raw v
    WHERE v.projeto_atribuido_extra_id = p_projeto_id
      AND v.data_venda >= p_from AND v.data_venda < p_to
  ),
  combined AS (
    SELECT dia, status, moeda, cnt, total FROM rollup
    UNION ALL
    SELECT dia, status, moeda, -1, -valor_operacional_final FROM overrides_subtract
    UNION ALL
    SELECT dia, status, moeda, 1, valor_operacional_final FROM overrides_add_exclusive
    UNION ALL
    SELECT dia, status, moeda, 1, valor_operacional_final FROM overrides_add_extra
  )
  SELECT dia, status, moeda, sum(cnt)::bigint AS cnt, coalesce(sum(total), 0) AS total
  FROM combined
  GROUP BY dia, status, moeda;
$function$;
