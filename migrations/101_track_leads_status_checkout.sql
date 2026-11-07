-- Status "checkout": InitiateCheckout há menos de 10 minutos sem compra.
-- Depois de 10 minutos sem compra, vira "abandonou" (abandono de carrinho).
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
