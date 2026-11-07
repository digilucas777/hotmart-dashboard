-- Painel e leads rápidos pro usuário logado: a RLS de track_events e de vendas
-- era conferida linha por linha e estourava o tempo (60 s+ logado, 3 s como admin).
-- Agora as funções são security definer e conferem UMA vez que a instalação é
-- do usuário (auth.uid()); de outra pessoa, voltam vazias.

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
         e.raw_payload->'data'->'buyer'->'address'->>'country_iso' as pais_comprador
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
security definer
set search_path = public
as $$
with inst as (
  -- só a instalação do próprio usuário (conferido uma vez, em vez da RLS linha por linha)
  select id from track_installations where id = p_installation and user_id = (select auth.uid())
),
ev as (
  select coalesce(session_id, 'tx:' || received_at::text) as lead,
         event_name, source, received_at, fbc, capi_send_ok, geo_country
  from track_events
  where installation_id = (select id from inst) and received_at >= p_start and received_at < p_end
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
         bool_or(fbc is not null) as com_fbc,
         max(geo_country) as pais,
         max(received_at) filter (where event_name = 'InitiateCheckout') as ic_em,
         bool_or(event_name = 'Purchase' and source = 'capi' and coalesce(capi_send_ok, true)) as enviada_fb
  from ev
  group by lead
),
-- vendas do período (índice só de Purchase, migration 105); valor igual ao da dashboard
c as (
  select distinct on (lead) * from (
    select coalesce(e.session_id, 'tx:' || e.received_at::text) as lead, e.received_at,
           nullif(trim(coalesce(e.raw_payload->'data'->'buyer'->>'name', '')), '') as nome,
           e.raw_payload->'data'->'buyer'->>'email' as email,
           coalesce(nullif(e.raw_payload->'data'->'buyer'->>'checkout_phone', ''), e.raw_payload->'data'->'buyer'->>'phone') as telefone,
           e.raw_payload->'data'->'product'->>'name' as produto,
           coalesce(v.valor_operacional_final::text, e.raw_payload->'data'->'purchase'->'price'->>'value') as valor,
           coalesce(v.moeda, e.raw_payload->'data'->'purchase'->'price'->>'currency_value') as moeda,
           e.utm_source, e.utm_term, e.utm_medium, e.utm_campaign, e.utm_content, e.src, e.geo_city, e.url
    from track_events e
    left join public.vendas v on v.hotmart_id = e.raw_payload->'data'->'purchase'->>'transaction'
    where e.installation_id = (select id from inst) and e.event_name = 'Purchase'
      and e.received_at >= p_start and e.received_at < p_end
  ) x order by lead, received_at desc
),
-- Abandono de carrinho da Hotmart (vendas, status abandoned): nome, e-mail e
-- telefone, ligado ao lead quando chegou 25 a 75 min depois do
-- InitiateCheckout, mesmo produto, mesmo país, e é a ÚNICA combinação possível.
prods as (
  select distinct p from (
    select raw_payload->'data'->'product'->>'id' p from track_events
    where installation_id = (select id from inst) and event_name = 'Purchase'
    union all
    select unnest(meta_purchase_product_ids)::text from track_installations where id = (select id from inst)
  ) x where p is not null
),
ab as (
  select v.id, v.data_criacao t,
         (v.hotmart_payload::jsonb)->'data'->'checkout_country'->>'iso' pais,
         (v.hotmart_payload::jsonb)->'data'->'buyer' comprador,
         v.produto
  from vendas v
  where v.status = 'abandoned'
    and v.hotmart_produto_id::text in (select p from prods)
    and v.data_criacao >= p_start + interval '25 minutes' and v.data_criacao < p_end + interval '75 minutes'
),
par as (
  select l.lead, ab.id ab_id, ab.comprador, ab.produto
  from l join ab on ab.pais = l.pais
   and ab.t between l.ic_em + interval '25 minutes' and l.ic_em + interval '75 minutes'
  where l.status = 'abandonou'
),
unico as (
  select p.* from par p
  where (select count(*) from par x where x.ab_id = p.ab_id) = 1
    and (select count(*) from par x where x.lead = p.lead) = 1
),
base as (
  select l.*,
         coalesce(c.nome, nullif(trim(coalesce(u.comprador->>'name', '')), '')) as nome,
         coalesce(c.email, u.comprador->>'email') as email,
         coalesce(c.telefone, nullif(u.comprador->>'checkout_phone', ''), u.comprador->>'phone') as telefone,
         coalesce(c.produto, u.produto) as produto,
         c.valor, c.moeda,
         (u.lead is not null) as dados_abandono
  from l left join c on c.lead = l.lead
         left join unico u on u.lead = l.lead
),
-- só com busca: leads cujas UTMs, src ou cidade batem com o texto
busca as (
  select distinct coalesce(session_id, 'tx:' || received_at::text) as lead
  from track_events
  where coalesce(p_busca, '') <> ''
    and installation_id = (select id from inst) and received_at >= p_start and received_at < p_end and not is_bot
    and concat_ws(' ', utm_campaign, utm_content, utm_medium, utm_term, src, geo_city) ilike '%' || p_busca || '%'
),
filtrado as (
  select * from base
  where (p_status is null or status = p_status)
    and (coalesce(p_busca, '') = ''
         or lead in (select lead from busca)
         or concat_ws(' ', nome, email, telefone, produto) ilike '%' || p_busca || '%')
),
pagina as (
  select * from filtrado order by ultimo desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
),
-- detalhes (UTMs, cidade, página) só dos leads mostrados
det as (
  select e.session_id as lead,
         max(e.utm_source) utm_source, max(e.utm_term) utm_term, max(e.utm_medium) utm_medium,
         max(e.utm_campaign) utm_campaign, max(e.utm_content) utm_content, max(e.src) src,
         max(e.geo_city) cidade,
         min(e.url) filter (where e.event_name = 'PageView') pagina
  from track_events e
  where e.session_id in (select lead from pagina)
    and e.installation_id = (select id from inst) and e.received_at >= p_start and e.received_at < p_end and not e.is_bot
  group by e.session_id
),
saida as (
  select p.lead, p.primeiro, p.ultimo, p.status, p.paginas, p.com_fbc, p.pais, p.enviada_fb,
         p.nome, p.email, p.telefone, p.produto, p.valor, p.moeda, p.dados_abandono,
         coalesce(d.utm_source, c.utm_source) utm_source,
         coalesce(d.utm_term, c.utm_term) utm_term,
         coalesce(d.utm_medium, c.utm_medium) utm_medium,
         coalesce(d.utm_campaign, c.utm_campaign) utm_campaign,
         coalesce(d.utm_content, c.utm_content) utm_content,
         coalesce(d.src, c.src) src,
         coalesce(d.cidade, c.geo_city) cidade,
         coalesce(d.pagina, c.url) pagina
  from pagina p
  left join det d on d.lead = p.lead
  left join c on c.lead = p.lead
)
select jsonb_build_object(
  'contagem', (select jsonb_object_agg(status, n) from (select status, count(*) n from base group by 1) x),
  'total', (select count(*) from filtrado),
  'leads', coalesce((select jsonb_agg(to_jsonb(s) order by s.ultimo desc) from saida s), '[]'::jsonb)
);
$$;

revoke all on function public.track_dashboard(uuid, timestamptz, timestamptz, text, boolean) from public, anon;
grant execute on function public.track_dashboard(uuid, timestamptz, timestamptz, text, boolean) to authenticated;
revoke all on function public.track_leads(uuid, timestamptz, timestamptz, text, text, integer, integer) from public, anon;
grant execute on function public.track_leads(uuid, timestamptz, timestamptz, text, text, integer, integer) to authenticated;
