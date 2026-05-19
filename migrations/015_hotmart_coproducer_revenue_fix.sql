-- Corrige a base para guardar e recalcular faturamento Hotmart sem misturar moedas.
-- Rode no Supabase SQL Editor depois do deploy do webhook atualizado.

alter table public.vendas
  add column if not exists valor_recebido numeric,
  add column if not exists comissao_coprodutor numeric not null default 0,
  add column if not exists hotmart_payload jsonb;

-- Backfill usando payload bruto salvo pelo webhook novo.
-- Vendas antigas sem hotmart_payload não têm a comissão de coprodutor recuperável pela base.
update public.vendas v
set
  valor_recebido = coalesce(calc.valor_recebido, v.valor),
  comissao_coprodutor = calc.comissao_coprodutor,
  valor = case
    when v.status = 'abandoned' then 0
    else round((coalesce(calc.valor_recebido, v.valor) + calc.comissao_coprodutor)::numeric, 2)
  end
from (
  select
    id,
    coalesce(sum((c->>'value')::numeric) filter (
      where c->>'currency_value' = moeda
        and upper(c->>'source') in ('PRODUCER', 'SELLER', 'VENDOR')
    ), valor) as valor_recebido,
    coalesce(sum((c->>'value')::numeric) filter (
      where c->>'currency_value' = moeda
        and (
          upper(c->>'source') like '%COPRODUCER%'
          or upper(c->>'source') like '%CO_PRODUCER%'
          or upper(c->>'source') like '%CO-PRODUCER%'
          or upper(c->>'source') like '%COPRODUTOR%'
        )
    ), 0) as comissao_coprodutor
  from public.vendas
  cross join lateral jsonb_array_elements(coalesce(hotmart_payload->'data'->'commissions', '[]'::jsonb)) c
  where hotmart_payload is not null
  group by id, moeda, valor
) calc
where calc.id = v.id;

-- Opcional para vendas antigas sem payload:
-- preencha esta tabela temporaria com hotmart_id, moeda e comissao_coprodutor,
-- depois rode o update abaixo e descarte a tabela.
create table if not exists public.hotmart_coproducer_backfill (
  hotmart_id text primary key,
  moeda text not null,
  comissao_coprodutor numeric not null
);

update public.vendas v
set
  comissao_coprodutor = b.comissao_coprodutor,
  valor_recebido = coalesce(v.valor_recebido, v.valor),
  valor = case
    when v.status = 'abandoned' then 0
    else round((coalesce(v.valor_recebido, v.valor) + b.comissao_coprodutor)::numeric, 2)
  end
from public.hotmart_coproducer_backfill b
where b.hotmart_id = v.hotmart_id
  and b.moeda = v.moeda;

notify pgrst, 'reload schema';
