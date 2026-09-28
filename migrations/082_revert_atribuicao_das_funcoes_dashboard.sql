-- Migration 082: DESATIVA a atribuição manual (076/077) das funções que a
-- dashboard usa de verdade — volta get_vendas_summary_v2,
-- get_vendas_summary_multi_v2 e get_vendas_por_dia pro EXATO estado de antes
-- de hoje (migrations 068/069, sem nenhuma menção a
-- projeto_atribuido_id/projeto_atribuido_extra_id).
--
-- Pedido explícito do Lucas (27-28/09/2026) depois de instabilidade
-- persistente em produção mesmo após 3 tentativas de correção (078, 080,
-- 081) + ANALYZE: "desative e faça voltar ao normal". Prioriza estabilidade
-- — a feature de atribuição (robô de leads Recuperação/App-Inglês) continua
-- rodando e gravando nas colunas normalmente, só que a dashboard volta a
-- ignorá-las (mesmo comportamento de antes de hoje). As vendas atribuídas
-- não aparecerão separadas até isso ser revisitado com calma, fora de
-- horário de pico.

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
  filtrado AS (
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
  )
  SELECT status, moeda, sum(cnt)::bigint AS cnt, coalesce(sum(total), 0) AS total
  FROM filtrado
  GROUP BY status, moeda;
$function$;

CREATE OR REPLACE FUNCTION public.get_vendas_summary_multi_v2(p_projeto_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(projeto_id uuid, status text, moeda text, cnt bigint, total numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with allowed as (
    select pp.projeto_id, pr.hotmart_id, pp.todas_ofertas
    from projeto_produtos pp
    join produtos pr on pr.id = pp.produto_id
    where pp.projeto_id = any(p_projeto_ids)
  ),
  allowed_ofertas as (
    select ppo.projeto_id, pr.hotmart_id, ppo.oferta_codigo
    from projeto_produto_ofertas ppo
    join produtos pr on pr.id = ppo.produto_id
    where ppo.projeto_id = any(p_projeto_ids)
  ),
  filtrado as (
    select a.projeto_id, r.status, r.moeda, r.cnt, r.total
    from vendas_resumo_diario r
    join allowed a on a.hotmart_id = r.hotmart_produto_id
    where r.data >= (p_from at time zone 'America/Sao_Paulo')::date
      and r.data <= ((p_to - interval '1 second') at time zone 'America/Sao_Paulo')::date
      and (
        a.todas_ofertas is distinct from false
        or exists (
          select 1 from allowed_ofertas ao
          where ao.projeto_id = a.projeto_id
            and ao.hotmart_id = r.hotmart_produto_id
            and ao.oferta_codigo = r.oferta_codigo
        )
      )
  )
  select projeto_id, status, moeda, sum(cnt)::bigint as cnt, coalesce(sum(total), 0) as total
  from filtrado
  group by projeto_id, status, moeda;
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
  )
  SELECT r.data, r.status, r.moeda, sum(r.cnt)::bigint AS cnt, coalesce(sum(r.total), 0) AS total
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
  GROUP BY r.data, r.status, r.moeda;
$function$;
