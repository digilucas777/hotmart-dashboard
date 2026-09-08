-- BUG CRÍTICO encontrado em produção (2026-09-08, relatado pelo Pedro: faturamento
-- de "ontem" subindo sozinho ao longo do dia seguinte, e não batendo com a Hotmart).
--
-- Causa raiz: vendas_resumo_diario guarda o "dia" de cada venda truncando
-- data_venda::date direto (fuso da sessão do Postgres, que é UTC) — mas o app
-- calcula "hoje"/"ontem"/etc no fuso de Brasília (BRT, UTC-3) e manda os limites
-- pro banco como timestamptz. get_vendas_summary_v2 então convertia esses limites
-- pra data com `p_from::date` / `(p_to - interval '1 second')::date`, também em
-- UTC — mas meia-noite BRT é 03:00 UTC, então esse cast empurra o limite de cima
-- pra frente: "ontem" (que devia ir só até 03:00 UTC de hoje) virava
-- `r.data <= data UTC de hoje`, incluindo o dia de HOJE inteiro (0h-24h UTC) na
-- soma de ontem. Por isso o valor de "ontem" crescia junto com as vendas de hoje.
--
-- A função antiga get_vendas_summary (sem rollup, direto em `vendas`) nunca teve
-- esse bug — ela compara timestamptz com timestamptz, sem truncar em dia. O bug
-- é específico do rollup, introduzido com ele (migration 064/067), não tem
-- relação com a mudança de paginação de vendas cruas (essa sim sem esse problema,
-- já que lê `vendas` diretamente com timestamptz).
--
-- Fix: todo lugar que decide "qual dia" uma venda pertence passa a converter pro
-- fuso de Brasília antes de truncar (`at time zone 'America/Sao_Paulo'`, sem DST
-- desde 2019, sempre UTC-3) — bucket do rollup e cálculo do intervalo de datas na
-- consulta, os dois com a mesma regra. Reconstrói o rollup inteiro do zero com a
-- data corrigida (o valor em si nunca esteve errado em `vendas`, só o "dia" que
-- o resumo pré-calculado usava).

create or replace function refresh_vendas_resumo_diario_by_hotmart_id(p_hotmart_id text)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_produto_id text;
  v_oferta text;
  v_data date;
begin
  select hotmart_produto_id, coalesce(oferta_codigo, ''),
         (data_venda at time zone 'America/Sao_Paulo')::date
    into v_produto_id, v_oferta, v_data
  from vendas
  where hotmart_id = p_hotmart_id;

  if v_produto_id is null or v_data is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_produto_id || '|' || v_oferta || '|' || v_data::text, 0));

  delete from vendas_resumo_diario
  where hotmart_produto_id = v_produto_id
    and oferta_codigo = v_oferta
    and data = v_data;

  insert into vendas_resumo_diario (hotmart_produto_id, oferta_codigo, data, status, moeda, cnt, total)
  select hotmart_produto_id, coalesce(oferta_codigo, ''), (data_venda at time zone 'America/Sao_Paulo')::date, status, moeda,
         count(*), coalesce(sum(valor_operacional_final), 0)
  from vendas
  where hotmart_produto_id = v_produto_id
    and coalesce(oferta_codigo, '') = v_oferta
    and (data_venda at time zone 'America/Sao_Paulo')::date = v_data
  group by 1, 2, 3, 4, 5;
end;
$$;

create or replace function refresh_vendas_resumo_diario_by_digistore_id(p_digistore_id text)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_produto_id text;
  v_oferta text;
  v_data date;
begin
  select hotmart_produto_id, coalesce(oferta_codigo, ''),
         (data_venda at time zone 'America/Sao_Paulo')::date
    into v_produto_id, v_oferta, v_data
  from vendas
  where digistore_id = p_digistore_id;

  if v_produto_id is null or v_data is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_produto_id || '|' || v_oferta || '|' || v_data::text, 0));

  delete from vendas_resumo_diario
  where hotmart_produto_id = v_produto_id
    and oferta_codigo = v_oferta
    and data = v_data;

  insert into vendas_resumo_diario (hotmart_produto_id, oferta_codigo, data, status, moeda, cnt, total)
  select hotmart_produto_id, coalesce(oferta_codigo, ''), (data_venda at time zone 'America/Sao_Paulo')::date, status, moeda,
         count(*), coalesce(sum(valor_operacional_final), 0)
  from vendas
  where hotmart_produto_id = v_produto_id
    and coalesce(oferta_codigo, '') = v_oferta
    and (data_venda at time zone 'America/Sao_Paulo')::date = v_data
  group by 1, 2, 3, 4, 5;
end;
$$;

create or replace function get_vendas_summary_v2(p_projeto_id uuid, p_from timestamptz, p_to timestamptz)
returns table(status text, moeda text, cnt bigint, total numeric)
language sql stable
set search_path to 'public'
as $$
  with allowed as (
    select pr.hotmart_id, pp.todas_ofertas
    from projeto_produtos pp
    join produtos pr on pr.id = pp.produto_id
    where pp.projeto_id = p_projeto_id
  ),
  allowed_ofertas as (
    select pr.hotmart_id, ppo.oferta_codigo
    from projeto_produto_ofertas ppo
    join produtos pr on pr.id = ppo.produto_id
    where ppo.projeto_id = p_projeto_id
  ),
  filtrado as (
    select r.status, r.moeda, r.cnt, r.total
    from vendas_resumo_diario r
    join allowed a on a.hotmart_id = r.hotmart_produto_id
    -- p_to é exclusivo (mesma semântica de get_vendas_summary original). O rollup
    -- guarda o dia no fuso de Brasília (ver refresh_vendas_resumo_diario_by_*
    -- acima) — os limites da consulta precisam da MESMA conversão, senão meia-
    -- noite BRT (03:00 UTC) cai num dia UTC diferente e inclui/perde um dia
    -- inteiro de vendas.
    where r.data >= (p_from at time zone 'America/Sao_Paulo')::date
      and r.data <= ((p_to - interval '1 second') at time zone 'America/Sao_Paulo')::date
      and (
        a.todas_ofertas is distinct from false
        or exists (
          select 1 from allowed_ofertas ao
          where ao.hotmart_id = r.hotmart_produto_id and ao.oferta_codigo = r.oferta_codigo
        )
      )
  )
  select status, moeda, sum(cnt)::bigint as cnt, coalesce(sum(total), 0) as total
  from filtrado
  group by status, moeda;
$$;

-- Reconstrói o rollup inteiro com a data corrigida (bucket antigo em UTC estava
-- errado pra qualquer venda que caísse entre 21h e 23h59 BRT, virando o dia
-- seguinte em UTC).
truncate table vendas_resumo_diario;

insert into vendas_resumo_diario (hotmart_produto_id, oferta_codigo, data, status, moeda, cnt, total)
select
  hotmart_produto_id,
  coalesce(oferta_codigo, ''),
  (data_venda at time zone 'America/Sao_Paulo')::date,
  status,
  moeda,
  count(*),
  coalesce(sum(valor_operacional_final), 0)
from vendas
where hotmart_produto_id is not null and data_venda is not null and status is not null and moeda is not null
group by 1, 2, 3, 4, 5
on conflict (hotmart_produto_id, oferta_codigo, data, status, moeda)
do update set cnt = excluded.cnt, total = excluded.total;
