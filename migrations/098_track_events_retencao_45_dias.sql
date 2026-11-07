-- Retenção do rastreamento: visitas, rolagens e cliques (tudo que não é venda)
-- ficam 45 dias. Antes de apagar, o total de cada dia vai pro resumo
-- track_events_daily (o funil continua com histórico). Vendas, reembolsos e
-- chargebacks ficam pra sempre. Aprovado pelo Lucas em 07/11/2026.

create table if not exists public.track_events_daily (
  installation_id uuid not null references public.track_installations(id) on delete cascade,
  day date not null,
  event_name text not null,
  source text not null,
  n integer not null default 0,
  primary key (installation_id, day, event_name, source)
);
alter table public.track_events_daily enable row level security;
drop policy if exists "users see own track_events_daily" on public.track_events_daily;
create policy "users see own track_events_daily" on public.track_events_daily
  for select using (exists (
    select 1 from public.track_installations i where i.id = track_events_daily.installation_id and i.user_id = (select auth.uid())
  ));

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
    returning installation_id, (received_at at time zone 'UTC')::date as dia, event_name, source
  ), agg as (
    insert into public.track_events_daily (installation_id, day, event_name, source, n)
    select installation_id, dia, event_name, source, count(*)::int from del group by 1, 2, 3, 4
    on conflict (installation_id, day, event_name, source) do update set n = public.track_events_daily.n + excluded.n
    returning n
  )
  select coalesce(sum(n), 0) into apagados from agg;
  return apagados;
end;
$$;
revoke all on function public.track_prune_events(integer) from public, anon, authenticated;

-- Roda todo dia às 04:30 UTC (01:30 em Brasília).
select cron.unschedule('track-prune-events') where exists (select 1 from cron.job where jobname = 'track-prune-events');
select cron.schedule('track-prune-events', '30 4 * * *', $$ select public.track_prune_events(45) $$);
