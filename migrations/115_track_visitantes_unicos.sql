-- 115: painel do rastreamento conta pessoas (visitantes únicos), não eventos.
-- Ex: francês 11/11 tinha 212 pessoas e 350 PageView (a mesma pessoa abre mais
-- de uma página): a Meta mostrava ~200 visualizações da página de destino.
-- Funil, gráfico dia a dia e países passam a contar sessões únicas por etapa;
-- o total de eventos continua em funil_eventos. O resumo diário (visitas com
-- mais de 15 dias) ganha a coluna "sessoes", preenchida daqui pra frente.

alter table public.track_events_daily add column if not exists sessoes integer;

create or replace function public.track_prune_events(dias integer default 45)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare apagados integer;
begin
  with del as (
    delete from public.track_events
    where received_at < now() - make_interval(days => dias)
      and event_name not in ('Purchase', 'Refund', 'Chargeback')
    returning installation_id, (received_at at time zone 'UTC')::date as dia, event_name, source, is_bot, session_id
  ), agg as (
    insert into public.track_events_daily (installation_id, day, event_name, source, n, sessoes)
    select installation_id, dia, event_name, source, count(*)::int, count(distinct session_id)::int
    from del where not is_bot group by 1, 2, 3, 4
    on conflict (installation_id, day, event_name, source) do update
      set n = public.track_events_daily.n + excluded.n,
          sessoes = coalesce(public.track_events_daily.sessoes, public.track_events_daily.n) + excluded.sessoes
    returning n
  )
  select coalesce(sum(n), 0) into apagados from agg;
  return apagados;
end;
$function$;

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
security definer
set search_path = public
as $$
with inst as (
  -- só a instalação do próprio usuário (conferido uma vez, em vez da RLS linha por linha)
  select id, coalesce(meta_purchase_product_ids, '{}')::text[] ids from track_installations where id = p_installation and user_id = (select auth.uid())
),
compras as (
  -- só as linhas de Purchase (índice parcial), pra não ler o payload de todas as visitas
  select received_at,
         (cardinality((select ids from inst)) = 0 or array[raw_payload->'data'->'product'->>'id'] <@ (select ids from inst)) as principal
  from track_events
  where installation_id = (select id from inst) and event_name = 'Purchase'
    and received_at >= p_start and received_at < p_end
),
ev as (
  select event_name, source, received_at, fbp, fbc, session_hit, capi_send_ok, geo_country, session_id
  from track_events
  where installation_id = (select id from inst) and received_at >= p_start and received_at < p_end
    and not is_bot
),
robos as (
  select count(*) n from track_events
  where installation_id = (select id from inst) and received_at >= p_start and received_at < p_end and is_bot
),
daily as (
  select day, event_name, source, n, coalesce(sessoes, n) sessoes
  from track_events_daily
  where installation_id = (select id from inst)
    and day >= (p_start at time zone 'UTC')::date and day < (p_end at time zone 'UTC')::date
),
-- Funil em pessoas: cada etapa conta visitantes únicos (sessões), não cliques
-- repetidos. Antes do resumo diário com "sessoes", usa a contagem de eventos.
funil as (
  select event_name, sum(n)::bigint n from (
    select event_name, count(distinct coalesce(session_id, received_at::text)) n from ev where source = 'capi' and event_name <> 'Purchase' group by 1
    union all
    select event_name, sum(sessoes) from daily where source = 'capi' and event_name <> 'Purchase' group by 1
    union all
    select 'Purchase', count(*) from compras where principal
  ) x group by 1
),
-- Total de eventos (cada abertura de página conta), só pra informação.
funil_eventos as (
  select event_name, sum(n)::bigint n from (
    select event_name, count(*) n from ev where source = 'capi' and event_name <> 'Purchase' group by 1
    union all
    select event_name, sum(n) from daily where source = 'capi' and event_name <> 'Purchase' group by 1
  ) x group by 1
),
serie as (
  select b, sum(pv)::bigint pv, sum(ic)::bigint ic, sum(vendas)::bigint vendas from (
    select case when p_hourly then to_char(date_trunc('hour', received_at at time zone p_tz), 'YYYY-MM-DD"T"HH24')
                else to_char((received_at at time zone p_tz)::date, 'YYYY-MM-DD') end b,
           count(distinct session_id) filter (where event_name = 'PageView' and source = 'capi') pv,
           count(distinct session_id) filter (where event_name = 'InitiateCheckout' and source = 'capi') ic,
           0 vendas
    from ev group by 1
    union all
    select case when p_hourly then to_char(date_trunc('hour', received_at at time zone p_tz), 'YYYY-MM-DD"T"HH24')
                else to_char((received_at at time zone p_tz)::date, 'YYYY-MM-DD') end, 0, 0, count(*)
    from compras where principal group by 1
    union all
    select to_char(day, 'YYYY-MM-DD'),
           sum(sessoes) filter (where event_name = 'PageView' and source = 'capi'),
           sum(sessoes) filter (where event_name = 'InitiateCheckout' and source = 'capi'),
           0
    from daily where not p_hourly group by 1
  ) x group by 1
),
paises as (
  select geo_country c, count(distinct session_id) n from ev
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
-- Valor da venda = o mesmo da dashboard (vendas.valor_operacional_final, já
-- convertido pela Hotmart na moeda da conta). Sem a venda na dashboard, usa
-- o preço pago pelo comprador.
vendas as (
  select e.received_at, e.source, e.session_hit, e.capi_send_ok, e.fbc is not null as com_fbc,
         e.geo_country, e.utm_source, e.utm_campaign, e.utm_medium, e.utm_content, e.utm_term, e.src,
         coalesce(v.valor_operacional_final::text, e.raw_payload->'data'->'purchase'->'price'->>'value') as valor,
         coalesce(v.moeda, e.raw_payload->'data'->'purchase'->'price'->>'currency_value') as moeda,
         e.raw_payload->'data'->'product'->>'name' as produto,
         e.raw_payload->'data'->'product'->>'id' as produto_id,
         (cardinality((select ids from inst)) = 0 or array[e.raw_payload->'data'->'product'->>'id'] <@ (select ids from inst)) as principal,
         e.raw_payload->'data'->'purchase'->>'transaction' as transacao,
         e.raw_payload->'data'->'buyer'->'address'->>'country_iso' as pais_comprador,
         v.status as status_venda
  from track_events e
  left join public.vendas v on v.hotmart_id = e.raw_payload->'data'->'purchase'->>'transaction'
  where e.installation_id = (select id from inst) and e.event_name = 'Purchase'
    and e.received_at >= p_start and e.received_at < p_end
  order by e.received_at desc
  limit 1000
)
select jsonb_build_object(
  'funil', coalesce((select jsonb_object_agg(event_name, n) from funil), '{}'::jsonb),
  'funil_eventos', coalesce((select jsonb_object_agg(event_name, n) from funil_eventos), '{}'::jsonb),
  'serie', coalesce((select jsonb_agg(jsonb_build_object('b', b, 'pv', coalesce(pv, 0), 'ic', coalesce(ic, 0), 'vendas', coalesce(vendas, 0)) order by b) from serie), '[]'::jsonb),
  'paises', coalesce((select jsonb_agg(jsonb_build_object('c', c, 'n', n) order by n desc) from paises), '[]'::jsonb),
  'qualidade', (select to_jsonb(q) from qual q),
  'robos', (select n from robos),
  'resumido', exists (select 1 from daily),
  'vendas', coalesce((select jsonb_agg(to_jsonb(v) order by v.received_at desc) from vendas v), '[]'::jsonb)
);
$$;

revoke all on function public.track_dashboard(uuid, timestamptz, timestamptz, text, boolean) from public, anon;
grant execute on function public.track_dashboard(uuid, timestamptz, timestamptz, text, boolean) to authenticated;
