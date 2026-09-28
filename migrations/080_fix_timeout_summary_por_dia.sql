-- Migration 080: corrige lentidão generalizada em get_vendas_summary_v2 /
-- get_vendas_summary_multi_v2 / get_vendas_por_dia (afetava TODOS os
-- projetos, não só o Inglês).
--
-- Bug real em produção (27/09/2026, poucos minutos depois da 079): Lucas
-- reportou lentidão/erro ao atualizar a dashboard do projeto do Fabrício
-- (mobile). Investigando: get_vendas_summary_v2 pro projeto dele fazia
-- 23.702 buffer hits e ~600ms pra uma janela de 30 dias; get_vendas_por_dia
-- fazia 41.704 buffer hits e ~2-3s pra 60 dias. Isso não deveria acontecer —
-- a correção de atribuição manual (migration 078) só deveria tocar um
-- punhado de linhas (hoje 2 no banco inteiro, via os índices parciais em
-- projeto_atribuido_id/projeto_atribuido_extra_id).
--
-- Causa raiz: a CTE `venda_overrides` da 078 fazia UM ÚNICO scan de `vendas`
-- com `WHERE data_venda BETWEEN ... AND (projeto_atribuido_id IS NOT NULL OR
-- projeto_atribuido_extra_id IS NOT NULL)` — Postgres (12+) faz inline de CTE
-- não-recursiva por padrão, então essa condição OR+AND vira só mais um Filter
-- dentro do plano geral, e o planner escolhe escanear pelo índice de DATA
-- (idx_vendas_data_venda) em vez do índice parcial de atribuição — quanto
-- maior o intervalo de datas pedido, mais linhas escaneadas à toa (o
-- oposto do que os índices parciais foram criados pra evitar). Mesma classe
-- de bug já corrigida em get_vendas_detalhadas (migration 079), só que lá a
-- separação em branches por UNION ALL bastou porque cada branch tinha um
-- FROM próprio; aqui a CTE única com múltiplas condições no mesmo WHERE
-- continuava deixando o planner escolher mal.
--
-- Fix: divide a correção em 3 buscas independentes, cada uma com UM SÓ
-- filtro de igualdade/IS NOT NULL numa coluna de atribuição como primeira
-- condição (bate exatamente com o predicado do índice parcial, sem
-- ambiguidade de qual índice usar) — filtro de data e o EXISTS contra
-- `allowed` (pequeno, ~dúzia de linhas) rodam só DEPOIS, sobre o punhado de
-- linhas já filtrado pelo índice parcial.

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
  -- venda naturalmente deste projeto, mas reatribuída (exclusivo) pra OUTRO
  -- projeto — o rollup acima já contou ela no natural, então subtrai.
  overrides_subtract AS (
    SELECT v.status, v.moeda, v.valor_operacional_final
    FROM vendas v
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
    FROM vendas v
    WHERE v.projeto_atribuido_id = p_projeto_id
      AND v.data_venda >= p_from AND v.data_venda < p_to
  ),
  overrides_add_extra AS (
    SELECT v.status, v.moeda, v.valor_operacional_final
    FROM vendas v
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
  -- Escopo global (não por projeto do array) — filtra só pelo índice parcial de
  -- atribuição primeiro (punhado de linhas no banco inteiro), cruza com os
  -- projetos do combo DEPOIS, sobre esse conjunto já minúsculo.
  overrides_subtract_raw AS (
    SELECT v.status, v.moeda, v.valor_operacional_final, v.hotmart_produto_id, v.oferta_codigo
    FROM vendas v
    WHERE v.projeto_atribuido_id IS NOT NULL
      AND v.data_venda >= p_from AND v.data_venda < p_to
  ),
  overrides_add_exclusive_raw AS (
    SELECT v.projeto_atribuido_id AS projeto_id, v.status, v.moeda, v.valor_operacional_final
    FROM vendas v
    WHERE v.projeto_atribuido_id IS NOT NULL
      AND v.projeto_atribuido_id = ANY(p_projeto_ids)
      AND v.data_venda >= p_from AND v.data_venda < p_to
  ),
  overrides_add_extra_raw AS (
    SELECT v.projeto_atribuido_extra_id AS projeto_id, v.status, v.moeda, v.valor_operacional_final
    FROM vendas v
    WHERE v.projeto_atribuido_extra_id IS NOT NULL
      AND v.projeto_atribuido_extra_id = ANY(p_projeto_ids)
      AND v.data_venda >= p_from AND v.data_venda < p_to
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
  overrides_subtract AS (
    SELECT (v.data_venda at time zone 'America/Sao_Paulo')::date AS dia, v.status, v.moeda, v.valor_operacional_final
    FROM vendas v
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
    FROM vendas v
    WHERE v.projeto_atribuido_id = p_projeto_id
      AND v.data_venda >= p_from AND v.data_venda < p_to
  ),
  overrides_add_extra AS (
    SELECT (v.data_venda at time zone 'America/Sao_Paulo')::date AS dia, v.status, v.moeda, v.valor_operacional_final
    FROM vendas v
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
