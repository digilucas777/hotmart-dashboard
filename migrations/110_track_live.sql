-- Aba lateral "Ao vivo" do painel de rastreamento: visitantes nos últimos 5 min,
-- últimas vendas (valor igual ao da dashboard) e atividade recente (sem robôs).
-- security definer + confere o dono uma vez (mesmo padrão da migration 109).

create or replace function public.track_live(p_installation uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with inst as (
  select id from track_installations where id = p_installation and user_id = (select auth.uid())
),
agora as (
  select count(distinct session_id) n from track_events
  where installation_id = (select id from inst) and received_at >= now() - interval '5 minutes' and not is_bot
),
ativ as (
  select event_name, received_at, geo_country, geo_city, utm_content, utm_term, source
  from track_events
  where installation_id = (select id from inst) and received_at >= now() - interval '3 days' and not is_bot
    and event_name in ('PageView', 'InitiateCheckout', 'Purchase')
    and not (event_name = 'InitiateCheckout' and source = 'pixel')
  order by received_at desc
  limit 30
),
ult as (
  select e.received_at,
         coalesce(e.raw_payload->'data'->'buyer'->'address'->>'country_iso', e.geo_country) pais,
         coalesce(v.valor_operacional_final::text, e.raw_payload->'data'->'purchase'->'price'->>'value') valor,
         coalesce(v.moeda, e.raw_payload->'data'->'purchase'->'price'->>'currency_value') moeda,
         e.raw_payload->'data'->'product'->>'name' produto,
         e.utm_content
  from track_events e
  left join public.vendas v on v.hotmart_id = e.raw_payload->'data'->'purchase'->>'transaction'
  where e.installation_id = (select id from inst) and e.event_name = 'Purchase'
  order by e.received_at desc
  limit 8
)
select jsonb_build_object(
  'agora', (select n from agora),
  'atividade', coalesce((select jsonb_agg(to_jsonb(a) order by a.received_at desc) from ativ a), '[]'::jsonb),
  'vendas', coalesce((select jsonb_agg(to_jsonb(u) order by u.received_at desc) from ult u), '[]'::jsonb)
);
$$;

revoke all on function public.track_live(uuid) from public, anon;
grant execute on function public.track_live(uuid) to authenticated;
