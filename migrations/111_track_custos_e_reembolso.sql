-- Custos lançados à mão no painel de rastreamento (por instalação), pra ROAS,
-- lucro e gasto total. Cada usuário só vê/mexe nos custos das próprias
-- instalações. E o painel passa a receber o status da venda na dashboard
-- (refunded/chargeback) pra mostrar reembolso e taxa de reembolso.

create table if not exists public.track_custos (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.track_installations(id) on delete cascade,
  data date not null,
  valor numeric(12,2) not null check (valor >= 0),
  moeda text not null default 'BRL' check (moeda in ('BRL', 'USD')),
  descricao text,
  created_at timestamptz not null default now()
);
create index if not exists idx_track_custos_inst_data on public.track_custos (installation_id, data);
alter table public.track_custos enable row level security;
drop policy if exists "users manage own track_custos" on public.track_custos;
create policy "users manage own track_custos" on public.track_custos
  for all
  using (exists (select 1 from public.track_installations i where i.id = track_custos.installation_id and i.user_id = (select auth.uid())))
  with check (exists (select 1 from public.track_installations i where i.id = track_custos.installation_id and i.user_id = (select auth.uid())));

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
  select id from track_installations where id = p_installation and user_id = (select auth.uid())
),
ev as (
  select event_name, source, received_at, fbp, fbc, session_hit, capi_send_ok, geo_country
  from track_events
  where installation_id = (select id from inst) and received_at >= p_start and received_at < p_end
    and not is_bot
),
robos as (
  select count(*) n from track_events
  where installation_id = (select id from inst) and received_at >= p_start and received_at < p_end and is_bot
),
daily as (
  select day, event_name, source, n
  from track_events_daily
  where installation_id = (select id from inst)
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
-- Valor da venda = o mesmo da dashboard (vendas.valor_operacional_final, já
-- convertido pela Hotmart na moeda da conta). Sem a venda na dashboard, usa
-- o preço pago pelo comprador.
vendas as (
  select e.received_at, e.source, e.session_hit, e.capi_send_ok, e.fbc is not null as com_fbc,
         e.geo_country, e.utm_source, e.utm_campaign, e.utm_medium, e.utm_content, e.utm_term, e.src,
         coalesce(v.valor_operacional_final::text, e.raw_payload->'data'->'purchase'->'price'->>'value') as valor,
         coalesce(v.moeda, e.raw_payload->'data'->'purchase'->'price'->>'currency_value') as moeda,
         e.raw_payload->'data'->'product'->>'name' as produto,
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
