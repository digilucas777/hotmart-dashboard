-- Migration 076: atribuição manual de venda pra outro projeto
--
-- Caso de uso: um lead do Lucas (já comprou produto do tráfego em inglês
-- dele) compra de novo via Recuperação ou App-Inglês — só que aí sob outro
-- hotmart_produto_id, que não é dele. Não dá pra resolver isso com
-- projeto_produtos (é por produto, não por comprador), então cada venda
-- pode ser atribuída individualmente a um projeto diferente do que o
-- produto normalmente aponta.
--
-- Quando projeto_atribuido_id está preenchido, get_vendas_summary passa a
-- contar essa venda SÓ no projeto atribuído — nunca mais no projeto
-- "natural" do produto (evita contar em dobro).

ALTER TABLE public.vendas
  ADD COLUMN projeto_atribuido_id uuid NULL REFERENCES public.projetos(id);

CREATE INDEX vendas_projeto_atribuido_id_idx ON public.vendas(projeto_atribuido_id) WHERE projeto_atribuido_id IS NOT NULL;

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
