-- Migration 077: atribuição EXTRA de venda (aditiva, não exclusiva)
--
-- projeto_atribuido_id (migração 076) é exclusivo: quando preenchido, a
-- venda só conta nesse projeto, nunca mais no "natural" do produto.
-- projeto_atribuido_extra_id é ADITIVO: a venda passa a contar TAMBÉM
-- nesse projeto, sem tirar de onde já contava.
--
-- Caso de uso (Lucas, 27/09/2026): quando o robô atribui uma venda de
-- Recuperação/App-Inglês pro projeto LUCAS-RECUPERAÇÃO+APP INGLES
-- (projeto_atribuido_id), ela agora TAMBÉM conta no tráfego pago dele
-- (⚪ [En] Lucas) via projeto_atribuido_extra_id — sem sair da Recuperação.
-- A função atribuir_leads_ingles_lucas já seta os dois campos e marca o
-- nome do produto com "— Venda atribuída lead do Lucas" pra ficar visível
-- na tabela de transações.

ALTER TABLE public.vendas
  ADD COLUMN projeto_atribuido_extra_id uuid NULL REFERENCES public.projetos(id);

CREATE INDEX vendas_projeto_atribuido_extra_id_idx ON public.vendas(projeto_atribuido_extra_id) WHERE projeto_atribuido_extra_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_vendas_summary(p_projeto_id uuid, p_from timestamp with time zone, p_to timestamp with time zone)
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
    SELECT v.status, v.moeda, v.valor_operacional_final
    FROM vendas v
    LEFT JOIN allowed a ON a.hotmart_id = v.hotmart_produto_id
    WHERE v.data_venda >= p_from AND v.data_venda < p_to
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
  )
  SELECT status, moeda, count(*)::bigint AS cnt, coalesce(sum(valor_operacional_final), 0) AS total
  FROM filtrado
  GROUP BY status, moeda;
$function$;

CREATE OR REPLACE FUNCTION public.atribuir_leads_ingles_lucas(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(venda_id uuid, hotmart_id text, comprador_email text, projeto_origem_id uuid, valor numeric)
LANGUAGE sql
AS $function$
  WITH meus_leads AS (
    SELECT DISTINCT lower(trim(v.comprador_email)) AS email
    FROM vendas v
    JOIN produtos pr ON pr.hotmart_id = v.hotmart_produto_id
    JOIN projeto_produtos pp ON pp.produto_id = pr.id
    WHERE pp.projeto_id = '5f41d65a-8fd5-4a13-811c-4a26460540af'
      AND v.status = 'approved'
      AND v.comprador_email IS NOT NULL
  ),
  candidatos AS (
    SELECT v.id, v.hotmart_id, v.comprador_email, pp.projeto_id AS projeto_origem_id, v.valor_operacional_final AS valor
    FROM vendas v
    JOIN produtos pr ON pr.hotmart_id = v.hotmart_produto_id
    JOIN projeto_produtos pp
      ON pp.produto_id = pr.id
     AND pp.projeto_id IN ('c646c137-700f-47ba-bfb7-929f0a894b2f','4f1affab-bd9f-4583-b133-e1a57741cab1')
     AND (
       pp.todas_ofertas IS DISTINCT FROM false
       OR EXISTS (
         SELECT 1 FROM projeto_produto_ofertas ppo
         WHERE ppo.projeto_id = pp.projeto_id AND ppo.produto_id = pr.id AND ppo.oferta_codigo = v.oferta_codigo
       )
     )
    WHERE v.data_venda >= p_from AND v.data_venda < p_to
      AND v.projeto_atribuido_id IS NULL
      AND v.comprador_email IS NOT NULL
      AND lower(trim(v.comprador_email)) IN (SELECT email FROM meus_leads)
  )
  UPDATE vendas v
  SET projeto_atribuido_id = 'ed9979d9-ba73-4668-ab65-d6d4e1e1b5a3',
      projeto_atribuido_extra_id = '5f41d65a-8fd5-4a13-811c-4a26460540af',
      produto = v.produto || ' — Venda atribuída lead do Lucas'
  FROM candidatos c
  WHERE v.id = c.id
  RETURNING v.id AS venda_id, v.hotmart_id, v.comprador_email, c.projeto_origem_id, c.valor;
$function$;
