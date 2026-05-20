-- Arquitetura financeira oficial Hotmart.
-- A partir desta migration, o frontend deve ler somente valor_operacional_final.
-- As demais colunas mantem os componentes separados calculados no webhook.

alter table public.vendas
  add column if not exists valor_bruto numeric,
  add column if not exists taxa_hotmart numeric not null default 0,
  add column if not exists comissao_produtor numeric not null default 0,
  add column if not exists comissao_coprodutor numeric not null default 0,
  add column if not exists comissao_afiliado numeric not null default 0,
  add column if not exists valor_operacional_final numeric not null default 0;

-- Backfill seguro para vendas que possuem o payload bruto salvo.
-- Nunca mistura moedas: cada comissao so entra quando currency_value = vendas.moeda.
with calculated as (
  select
    v.id,
    coalesce((v.hotmart_payload->'data'->'purchase'->'original_offer_price'->>'value')::numeric,
             (v.hotmart_payload->'data'->'purchase'->'price'->>'value')::numeric,
             v.valor,
             0) as valor_bruto,
    coalesce(sum((c->>'value')::numeric) filter (
      where c->>'currency_value' = v.moeda
        and upper(c->>'source') = 'MARKETPLACE'
    ), 0) as taxa_hotmart,
    coalesce(sum((c->>'value')::numeric) filter (
      where c->>'currency_value' = v.moeda
        and (
          upper(c->>'source') in ('PRODUCER', 'SELLER', 'VENDOR')
          or upper(c->>'source') like '%OWNER%'
        )
    ), 0) as comissao_produtor,
    coalesce(sum((c->>'value')::numeric) filter (
      where c->>'currency_value' = v.moeda
        and (
          upper(c->>'source') like '%COPRODUCER%'
          or upper(c->>'source') like '%CO_PRODUCER%'
          or upper(c->>'source') like '%CO-PRODUCER%'
          or upper(c->>'source') like '%COPRODUTOR%'
        )
    ), 0) as comissao_coprodutor,
    coalesce(sum((c->>'value')::numeric) filter (
      where c->>'currency_value' = v.moeda
        and (
          upper(c->>'source') like '%AFFILIATE%'
          or upper(c->>'source') like '%AFILIADO%'
        )
    ), 0) as comissao_afiliado
  from public.vendas v
  left join lateral jsonb_array_elements(coalesce(v.hotmart_payload->'data'->'commissions', '[]'::jsonb)) c on true
  where v.hotmart_payload is not null
  group by v.id, v.moeda, v.valor, v.hotmart_payload
)
update public.vendas v
set
  valor_bruto = calculated.valor_bruto,
  taxa_hotmart = calculated.taxa_hotmart,
  comissao_produtor = calculated.comissao_produtor,
  comissao_coprodutor = calculated.comissao_coprodutor,
  comissao_afiliado = calculated.comissao_afiliado,
  valor_recebido = calculated.comissao_produtor,
  valor_operacional_final = case
    when v.status = 'abandoned' then 0
    else round((
      calculated.comissao_produtor
      + calculated.comissao_coprodutor
      + calculated.comissao_afiliado
      - calculated.taxa_hotmart
    )::numeric, 2)
  end,
  valor = case
    when v.status = 'abandoned' then 0
    else round((
      calculated.comissao_produtor
      + calculated.comissao_coprodutor
      + calculated.comissao_afiliado
      - calculated.taxa_hotmart
    )::numeric, 2)
  end
from calculated
where calculated.id = v.id;

-- Compatibilidade para registros antigos sem payload.
-- Nao reinterpreta comissoes: apenas preserva o valor legado como consolidado.
update public.vendas
set
  valor_bruto = coalesce(valor_bruto, valor, 0),
  valor_operacional_final = coalesce(nullif(valor_operacional_final, 0), valor, 0)
where hotmart_payload is null;

notify pgrst, 'reload schema';
