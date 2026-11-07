-- Robôs (rastreador de anúncio da Meta, Ahrefs, HubSpot, 360Spider, Google
-- etc.) entravam como visita no painel. Agora cada evento do navegador é
-- marcado pelo nome do navegador (user agent). Não apaga nada: só marca
-- is_bot = true e o painel ignora. Pedido do Lucas em 07/11/2026.
--
-- NÃO usa o IP da Meta (2a03:2880::, 31.13. ...) como sinal: conferido em
-- 07/11/2026 que quase todo acesso vindo desses IPs é gente de verdade no
-- navegador do Instagram/Facebook, com clique de anúncio (fbc).
-- Vendas (Purchase) e eventos do monitor (source pixel) vêm do servidor,
-- sem navegador, então nunca são marcados.

create or replace function public.track_is_bot(p_ua text, p_source text, p_event text)
returns boolean
language sql
immutable
as $$
  select p_source = 'capi' and p_event <> 'Purchase' and (
    p_ua is null or btrim(p_ua) = ''
    -- (?<!cu)bot: "Cubot" é marca de celular (gente real no Instagram)
    or p_ua ~* '((?<!cu)bot|crawl|spider|slurp|facebookexternalhit|meta-external|facebookcatalog|headlesschrome|lighthouse|pingdom|hubspot|ahrefs|semrush|mj12|bytespider|googleother|google-inspectiontool|mediapartners|bingpreview|python-requests|curl/|wget/|go-http|axios/|node-fetch|phantomjs|puppeteer|playwright|selenium|scrapy)'
  )
$$;

alter table public.track_events add column if not exists is_bot boolean not null default false;

create or replace function public.track_events_marca_robo()
returns trigger
language plpgsql
as $$
begin
  new.is_bot := public.track_is_bot(new.user_agent, new.source, new.event_name);
  return new;
end;
$$;

drop trigger if exists track_events_marca_robo on public.track_events;
create trigger track_events_marca_robo
  before insert or update of user_agent, source, event_name on public.track_events
  for each row execute function public.track_events_marca_robo();

-- marca os que já existem (só as linhas que batem, não regrava a tabela toda)
update public.track_events set is_bot = true
where source = 'capi' and event_name <> 'Purchase' and is_bot = false
  and public.track_is_bot(user_agent, source, event_name);

-- retenção de 45 dias: robô sai sem entrar no total por dia
create or replace function public.track_prune_events(dias integer default 45)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare apagados integer;
begin
  with del as (
    delete from public.track_events
    where received_at < now() - make_interval(days => dias)
      and event_name not in ('Purchase', 'Refund', 'Chargeback')
    returning installation_id, (received_at at time zone 'UTC')::date as dia, event_name, source, is_bot
  ), agg as (
    insert into public.track_events_daily (installation_id, day, event_name, source, n)
    select installation_id, dia, event_name, source, count(*)::int from del where not is_bot group by 1, 2, 3, 4
    on conflict (installation_id, day, event_name, source) do update set n = public.track_events_daily.n + excluded.n
    returning n
  )
  select coalesce(sum(n), 0) into apagados from agg;
  return apagados;
end;
$$;
revoke all on function public.track_prune_events(integer) from public, anon, authenticated;
