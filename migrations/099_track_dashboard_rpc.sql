-- Painel de rastreamento: junta numa consulta só o funil, a série do gráfico,
-- a qualidade dos dados e as vendas do período. Só leitura; security invoker,
-- então a RLS de track_events continua valendo (cada um só vê o que é seu).
-- Dias com mais de 45 dias vêm do resumo track_events_daily (migration 098).

create or replace function public.track_dashboard(
  p_installation uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_tz text default 'America/Sao_Paulo',
  p_hourly boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with ev as (
  select event_name, source, received_at, fbp, fbc, session_hit, capi_send_ok, geo_country
  from track_events
  where installation_id = p_installation and received_at >= p_start and received_at < p_end
),
daily as (
  select day, event_name, source, n
  from track_events_daily
  where installation_id = p_installation
    and day >= (p_start at time zone 'UTC')::date and day < (p_end at time zone 'UTC')::date
),
funil as (
  select event_name, sum(n)::bigint n from (
    select event_name, count(*) n from ev where source = 'capi' and event_name <> 'Purchase' group by 1
    union all
    select event_name, sum(n) from daily where source = 'capi' and event_name <> 'Purchase' group by 1
    union all
    select 'Purchase', count(*) from ev where event_name = 'Purchase'
  ) x group by 1
),
serie as (
  select b, sum(pv)::bigint pv, sum(ic)::bigint ic, sum(vendas)::bigint vendas from (
    select case when p_hourly then to_char(date_trunc('hour', received_at at time zone p_tz), 'YYYY-MM-DD"T"HH24')
                else to_char((received_at at time zone p_tz)::date, 'YYYY-MM-DD') end b,
           count(*) filter (where event_name = 'PageView' and source = 'capi') pv,
           count(*) filter (where event_name = 'InitiateCheckout' and source = 'capi') ic,
           count(*) filter (where event_name = 'Purchase') vendas
    from ev group by 1
    union all
    select to_char(day, 'YYYY-MM-DD'),
           sum(n) filter (where event_name = 'PageView' and source = 'capi'),
           sum(n) filter (where event_name = 'InitiateCheckout' and source = 'capi'),
           0
    from daily where not p_hourly group by 1
  ) x group by 1
),
paises as (
  select geo_country c, count(*) n from ev
  where event_name = 'PageView' and source = 'capi' and geo_country is not null
  group by 1 order by 2 desc limit 8
),
qual as (
  select count(*) filter (where source = 'capi') capi,
         count(*) filter (where source = 'capi' and fbp is not null) com_fbp,
         count(*) filter (where source = 'capi' and fbc is not null) com_fbc,
         count(*) filter (where source = 'capi' and capi_send_ok = false) falhas,
         count(*) filter (where event_name = 'Purchase' and source = 'capi') vendas_meta,
         count(*) filter (where event_name = 'Purchase' and source = 'capi' and session_hit) vendas_sessao,
         count(*) filter (where event_name = 'Purchase' and source = 'pixel') vendas_fora,
         count(*) filter (where event_name = 'InitiateCheckout' and source = 'pixel') ic_detectado
  from ev
),
vendas as (
  select received_at, source, session_hit, capi_send_ok, fbc is not null as com_fbc,
         geo_country, utm_source, utm_campaign, utm_content, src,
         raw_payload->'data'->'purchase'->'price'->>'value' as valor,
         raw_payload->'data'->'purchase'->'price'->>'currency_value' as moeda,
         raw_payload->'data'->'product'->>'name' as produto,
         raw_payload->'data'->'purchase'->>'transaction' as transacao,
         raw_payload->'data'->'buyer'->'address'->>'country_iso' as pais_comprador
  from track_events
  where installation_id = p_installation and event_name = 'Purchase'
    and received_at >= p_start and received_at < p_end
  order by received_at desc
  limit 1000
)
select jsonb_build_object(
  'funil', coalesce((select jsonb_object_agg(event_name, n) from funil), '{}'::jsonb),
  'serie', coalesce((select jsonb_agg(jsonb_build_object('b', b, 'pv', coalesce(pv, 0), 'ic', coalesce(ic, 0), 'vendas', coalesce(vendas, 0)) order by b) from serie), '[]'::jsonb),
  'paises', coalesce((select jsonb_agg(jsonb_build_object('c', c, 'n', n) order by n desc) from paises), '[]'::jsonb),
  'qualidade', (select to_jsonb(q) from qual q),
  'resumido', exists (select 1 from daily),
  'vendas', coalesce((select jsonb_agg(to_jsonb(v) order by v.received_at desc) from vendas v), '[]'::jsonb)
);
$$;

grant execute on function public.track_dashboard(uuid, timestamptz, timestamptz, text, boolean) to authenticated;
