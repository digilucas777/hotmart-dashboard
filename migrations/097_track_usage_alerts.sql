-- Um aviso de uso da Cloudflare por conta/métrica por período (dia no gratuito, mês no pago),
-- pra verificação de hora em hora não mandar o mesmo aviso toda hora.
create table if not exists public.track_usage_alerts (
  account_id text not null,
  metric text not null,
  period text not null,
  created_at timestamptz not null default now(),
  primary key (account_id, metric, period)
);
alter table public.track_usage_alerts enable row level security;
notify pgrst, 'reload schema';
