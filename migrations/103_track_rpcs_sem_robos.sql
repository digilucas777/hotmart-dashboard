-- Painel e lista de leads ignoram os acessos marcados como robô (migration 102).
-- O painel também mostra quantos acessos de robô foram ignorados no período.

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
    and not is_bot
),
robos as (
  select count(*) n from track_events
  where installation_id = p_installation and received_at >= p_start and received_at < p_end and is_bot
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
  'robos', (select n from robos),
  'resumido', exists (select 1 from daily),
  'vendas', coalesce((select jsonb_agg(to_jsonb(v) order by v.received_at desc) from vendas v), '[]'::jsonb)
);
$$;

grant execute on function public.track_dashboard(uuid, timestamptz, timestamptz, text, boolean) to authenticated;

create or replace function public.track_leads(
  p_installation uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_status text default null,
  p_busca text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with ev as (
  -- raw_payload só é lido nas vendas sem sessão (pra chave da linha)
  select case when session_id is not null then session_id
              else 'tx:' || coalesce(raw_payload->'data'->'purchase'->>'transaction', id::text) end as lead,
         id, event_name, source, received_at, fbc, capi_send_ok,
         url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, src,
         geo_city, geo_country
  from track_events
  where installation_id = p_installation and received_at >= p_start and received_at < p_end
    and not is_bot
),
l as (
  select lead,
         min(received_at) as primeiro,
         max(received_at) as ultimo,
         case
           when bool_or(event_name = 'Purchase') then 'comprou'
           -- checkout há menos de 10 min ainda é "iniciou"; passou disso sem compra vira abandono
           when max(received_at) filter (where event_name = 'InitiateCheckout') > now() - interval '10 minutes' then 'checkout'
           when bool_or(event_name = 'InitiateCheckout') then 'abandonou'
           when bool_or(event_name = 'AddToCart') then 'carrinho'
           when bool_or(event_name = 'ViewContent') then 'engajou'
           else 'visitou'
         end as status,
         count(*) filter (where event_name = 'PageView') as paginas,
         max(utm_source) as utm_source,
         max(utm_term) as utm_term,
         max(utm_medium) as utm_medium,
         max(utm_campaign) as utm_campaign,
         max(utm_content) as utm_content,
         max(src) as src,
         bool_or(fbc is not null) as com_fbc,
         max(geo_city) as cidade,
         max(geo_country) as pais,
         min(url) filter (where event_name = 'PageView') as pagina,
         max(id::text) filter (where event_name = 'Purchase') as compra_id,
         bool_or(event_name = 'Purchase' and source = 'capi' and coalesce(capi_send_ok, true)) as enviada_fb
  from ev
  group by lead
),
c as (
  select e.id::text as compra_id,
         nullif(trim(coalesce(e.raw_payload->'data'->'buyer'->>'name', '')), '') as nome,
         e.raw_payload->'data'->'buyer'->>'email' as email,
         coalesce(nullif(e.raw_payload->'data'->'buyer'->>'checkout_phone', ''), e.raw_payload->'data'->'buyer'->>'phone') as telefone,
         e.raw_payload->'data'->'product'->>'name' as produto,
         e.raw_payload->'data'->'purchase'->'price'->>'value' as valor,
         e.raw_payload->'data'->'purchase'->'price'->>'currency_value' as moeda
  from track_events e
  where e.installation_id = p_installation and e.event_name = 'Purchase'
    and e.received_at >= p_start and e.received_at < p_end
),
f as (
  select l.*, c.nome, c.email, c.telefone, c.produto, c.valor, c.moeda
  from l left join c on c.compra_id = l.compra_id
),
filtrado as (
  select * from f
  where (p_status is null or status = p_status)
    and (p_busca is null or p_busca = '' or concat_ws(' ', nome, email, telefone, utm_campaign, utm_content, utm_medium, cidade, produto) ilike '%' || p_busca || '%')
)
select jsonb_build_object(
  'contagem', (select jsonb_object_agg(status, n) from (select status, count(*) n from f group by 1) x),
  'total', (select count(*) from filtrado),
  'leads', coalesce((
    select jsonb_agg(to_jsonb(t) - 'compra_id' order by t.ultimo desc)
    from (select * from filtrado order by ultimo desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) t
  ), '[]'::jsonb)
);
$$;

grant execute on function public.track_leads(uuid, timestamptz, timestamptz, text, text, integer, integer) to authenticated;
