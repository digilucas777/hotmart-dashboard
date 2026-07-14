-- Migration 050: agregação de vendas no Postgres pra dashboards com muitas vendas
--
-- Hoje o dashboard baixa TODAS as linhas de `vendas` do período (26 colunas,
-- paginado de 1000 em 1000) e soma/agrupa tudo em JavaScript no navegador —
-- pra um projeto com dezenas de milhares de vendas isso passa de 30s. Estas
-- funções devolvem só o agregado (poucas linhas, tamanho fixo independente
-- de quantas vendas existirem), pro cálculo pesado sair do navegador e ir
-- pro banco, que já tem índice pra isso.
--
-- Todas SECURITY INVOKER (padrão) — a RLS de vendas/produtos/projeto_produtos
-- continua valendo com o auth.uid() de quem chama, então isso não é um jeito
-- de contornar permissão, só de agregar no lugar certo.

-- ─── 1. get_vendas_summary ──────────────────────────────────────────────────
-- Total de vendas por status x moeda no período — no máximo ~14 linhas
-- (7 status x 2 moedas), sempre, não importa quantas vendas existam.
-- Cobre os 17 data_source do tipo "metric" (total_converted, sales_count,
-- roas, lucro, etc.) e o "by_status".

CREATE OR REPLACE FUNCTION public.get_vendas_summary(
  p_projeto_id uuid, p_from timestamptz, p_to timestamptz
)
RETURNS TABLE(status text, moeda text, cnt bigint, total numeric)
LANGUAGE sql STABLE
SET search_path = public
AS $$
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
    SELECT v.status, v.moeda, v.valor_operacional_final
    FROM vendas v
    JOIN allowed a ON a.hotmart_id = v.hotmart_produto_id
    WHERE v.data_venda >= p_from AND v.data_venda < p_to
      AND (
        a.todas_ofertas IS DISTINCT FROM false
        OR EXISTS (
          SELECT 1 FROM allowed_ofertas ao
          WHERE ao.hotmart_id = v.hotmart_produto_id AND ao.oferta_codigo = v.oferta_codigo
        )
      )
  )
  SELECT status, moeda, count(*)::bigint AS cnt, coalesce(sum(valor_operacional_final), 0) AS total
  FROM filtrado
  GROUP BY status, moeda;
$$;

-- ─── 2. get_vendas_by_day ───────────────────────────────────────────────────
-- Faturamento/contagem agrupados por dia ou hora — usa generate_series pra
-- garantir que todo bucket do intervalo apareça mesmo sem vendas (senão o
-- gráfico fica com buracos). p_timezone existe porque o app hoje agrupa por
-- fuso do navegador de quem olha; aqui fixamos um fuso de negócio (padrão
-- America/Sao_Paulo) pra não depender de onde o navegador está.

CREATE OR REPLACE FUNCTION public.get_vendas_by_day(
  p_projeto_id uuid, p_from timestamptz, p_to timestamptz,
  p_granularity text DEFAULT 'day', p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS TABLE(bucket_start timestamp, revenue_brl numeric, revenue_usd numeric, count_approved bigint, count_refunded bigint)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  v_interval interval;
BEGIN
  IF p_granularity NOT IN ('hour', 'day') THEN
    RAISE EXCEPTION 'invalid granularity: %', p_granularity;
  END IF;
  v_interval := CASE p_granularity WHEN 'hour' THEN interval '1 hour' ELSE interval '1 day' END;

  RETURN QUERY
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
  buckets AS (
    SELECT generate_series(
      date_trunc(p_granularity, p_from AT TIME ZONE p_timezone),
      date_trunc(p_granularity, (p_to - interval '1 microsecond') AT TIME ZONE p_timezone),
      v_interval
    ) AS bucket_local
  ),
  filtrado AS (
    SELECT
      date_trunc(p_granularity, v.data_venda AT TIME ZONE p_timezone) AS bucket_local,
      v.status, v.moeda, v.valor_operacional_final
    FROM vendas v
    JOIN allowed a ON a.hotmart_id = v.hotmart_produto_id
    WHERE v.data_venda >= p_from AND v.data_venda < p_to
      AND (
        a.todas_ofertas IS DISTINCT FROM false
        OR EXISTS (
          SELECT 1 FROM allowed_ofertas ao
          WHERE ao.hotmart_id = v.hotmart_produto_id AND ao.oferta_codigo = v.oferta_codigo
        )
      )
  )
  SELECT
    b.bucket_local,
    coalesce(sum(f.valor_operacional_final) FILTER (WHERE f.status = 'approved' AND f.moeda = 'BRL'), 0),
    coalesce(sum(f.valor_operacional_final) FILTER (WHERE f.status = 'approved' AND f.moeda = 'USD'), 0),
    count(*) FILTER (WHERE f.status = 'approved')::bigint,
    count(*) FILTER (WHERE f.status = 'refunded')::bigint
  FROM buckets b
  LEFT JOIN filtrado f ON f.bucket_local = b.bucket_local
  GROUP BY b.bucket_local
  ORDER BY b.bucket_local;
END;
$$;

-- ─── 3. get_vendas_by_dimension ─────────────────────────────────────────────
-- Agrupado por produto/país/status/forma de pagamento — cobre revenue_by_product,
-- count_by_product, by_country e by_status. p_dimension validado contra uma
-- whitelist fixa, nunca interpolado como SQL. `by_payment` mantém a normalização
-- de forma de pagamento (normalizePagamento, lib/utils.ts) em JS sobre o
-- resultado já agrupado por forma_pagamento cru — essa regra de negócio muda
-- com frequência e duplicá-la em SQL arriscaria dessincronia.

CREATE OR REPLACE FUNCTION public.get_vendas_by_dimension(
  p_projeto_id uuid, p_from timestamptz, p_to timestamptz,
  p_dimension text, p_limit int DEFAULT 10
)
RETURNS TABLE(label text, cnt bigint, revenue_brl numeric, revenue_usd numeric)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
BEGIN
  IF p_dimension NOT IN ('produto', 'pais', 'status', 'forma_pagamento') THEN
    RAISE EXCEPTION 'invalid dimension: %', p_dimension;
  END IF;

  RETURN QUERY
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
    SELECT
      CASE p_dimension
        WHEN 'produto' THEN v.produto
        WHEN 'pais' THEN coalesce(v.pais, 'Desconhecido')
        WHEN 'status' THEN v.status
        WHEN 'forma_pagamento' THEN v.forma_pagamento
      END AS grp_label,
      v.moeda, v.valor_operacional_final
    FROM vendas v
    JOIN allowed a ON a.hotmart_id = v.hotmart_produto_id
    WHERE v.data_venda >= p_from AND v.data_venda < p_to
      AND (p_dimension = 'status' OR v.status = 'approved')
      AND (
        a.todas_ofertas IS DISTINCT FROM false
        OR EXISTS (
          SELECT 1 FROM allowed_ofertas ao
          WHERE ao.hotmart_id = v.hotmart_produto_id AND ao.oferta_codigo = v.oferta_codigo
        )
      )
  )
  -- Colunas de saída qualificadas com "filtrado." — o nome da coluna de retorno
  -- (label) colide com uma variável implícita do plpgsql (RETURNS TABLE cria
  -- uma variável por coluna), então "label" sozinho é ambíguo dentro da função.
  SELECT filtrado.grp_label, count(*)::bigint AS cnt,
    coalesce(sum(filtrado.valor_operacional_final) FILTER (WHERE filtrado.moeda = 'BRL'), 0),
    coalesce(sum(filtrado.valor_operacional_final) FILTER (WHERE filtrado.moeda = 'USD'), 0)
  FROM filtrado
  WHERE filtrado.grp_label IS NOT NULL
  GROUP BY filtrado.grp_label
  ORDER BY count(*) DESC
  LIMIT p_limit;
END;
$$;

-- ─── 4. Distintos de origem/afiliado ────────────────────────────────────────
-- loadOrigens/loadAfiliados (DashboardClient.tsx) buscavam origem/afiliado_nome
-- de TODAS as vendas do produto sem paginação — risco real de corte silencioso
-- no limite padrão de 1000 linhas do PostgREST (perda de dados, não só
-- lentidão). Mesmo padrão já usado por get_distinct_ofertas (migration 027).

CREATE OR REPLACE FUNCTION public.get_distinct_origens(hotmart_ids text[])
RETURNS TABLE(origem text)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT DISTINCT origem FROM public.vendas
  WHERE hotmart_produto_id = ANY(hotmart_ids) AND origem IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_distinct_afiliados(hotmart_ids text[])
RETURNS TABLE(afiliado_nome text)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT DISTINCT afiliado_nome FROM public.vendas
  WHERE hotmart_produto_id = ANY(hotmart_ids) AND afiliado_nome IS NOT NULL AND afiliado_nome <> '';
$$;

-- ─── 5. Índices ──────────────────────────────────────────────────────────────
-- idx_vendas_hotmart_produto_id (035) duplica vendas_hotmart_produto_id_idx
-- (006) — mesmo índice btree numa coluna só.
DROP INDEX IF EXISTS idx_vendas_hotmart_produto_id;

-- Índice composto pra filtros produto+status (ex: recentVendas já filtra
-- status='approved'); idx_vendas_produto_data (produto+data, sem status)
-- continua necessário separado pro fetch por período sem filtro de status.
CREATE INDEX IF NOT EXISTS idx_vendas_produto_status_data
  ON public.vendas (hotmart_produto_id, status, data_venda DESC);
