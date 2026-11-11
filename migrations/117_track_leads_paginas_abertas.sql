-- Tabela de leads: devolve também a lista das páginas que cada lead abriu.
CREATE OR REPLACE FUNCTION public.track_leads(p_installation uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_status text DEFAULT NULL::text, p_busca text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with inst as (
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
           when bool_or(event_name = 'InitiateCheckout') then 'checkout'
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
  where l.status = 'checkout'
),
unico as (
  select p.* from par p
  where (select count(*) from par x where x.ab_id = p.ab_id) = 1
    and (select count(*) from par x where x.lead = p.lead) = 1
),
base as (
  -- abandono só quando a Hotmart avisou e o aviso ligou com a visita
  select l.lead, l.primeiro, l.ultimo,
         case when u.lead is not null then 'abandonou' else l.status end as status,
         l.paginas, l.com_fbc, l.pais, l.ic_em, l.enviada_fb,
         coalesce(c.nome, nullif(trim(coalesce(u.comprador->>'name', '')), '')) as nome,
         coalesce(c.email, u.comprador->>'email') as email,
         coalesce(c.telefone, nullif(u.comprador->>'checkout_phone', ''), u.comprador->>'phone') as telefone,
         coalesce(c.produto, u.produto) as produto,
         c.valor, c.moeda,
         (u.lead is not null) as dados_abandono
  from l left join c on c.lead = l.lead
         left join unico u on u.lead = l.lead
),
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
-- páginas que o lead abriu (sem UTMs), na ordem da primeira visita
pags as (
  select lead, jsonb_agg(u order by t) lista from (
    select e.session_id lead, split_part(split_part(e.url, '?', 1), '#', 1) u, min(e.received_at) t
    from track_events e
    where e.session_id in (select lead from pagina) and e.event_name = 'PageView' and e.url is not null
      and e.installation_id = (select id from inst) and e.received_at >= p_start and e.received_at < p_end and not e.is_bot
    group by 1, 2
  ) x group by lead
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
         coalesce(d.pagina, c.url) pagina,
         coalesce(pg.lista, '[]'::jsonb) paginas_lista
  from pagina p
  left join det d on d.lead = p.lead
  left join c on c.lead = p.lead
  left join pags pg on pg.lead = p.lead
)
select jsonb_build_object(
  'contagem', (select jsonb_object_agg(status, n) from (select status, count(*) n from base group by 1) x),
  'total', (select count(*) from filtrado),
  'leads', coalesce((select jsonb_agg(to_jsonb(s) order by s.ultimo desc) from saida s), '[]'::jsonb)
);
$function$;
