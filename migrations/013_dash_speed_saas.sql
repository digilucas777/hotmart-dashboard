-- Dash Speed SaaS foundation.
-- New isolated tables only. Existing dashboard, Hotmart webhook and integrations are untouched.

create table if not exists public.dash_speed_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  default_plan text not null default 'starter' check (default_plan in ('starter', 'pro', 'agency', 'enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dash_speed_dashboards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  client_name text,
  layout_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dash_speed_widgets (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dash_speed_dashboards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('metric', 'line', 'bar', 'pie', 'table', 'funnel')),
  title text not null,
  data_source text not null,
  config jsonb not null default '{}'::jsonb,
  layout jsonb not null default '{"x":0,"y":0,"w":4,"h":4}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dash_speed_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan text not null check (plan in ('starter', 'pro', 'agency', 'enterprise')),
  status text not null default 'incomplete' check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dash_speed_integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('meta_ads', 'google_ads', 'hotmart', 'kiwify', 'shopify', 'whatsapp_api')),
  external_account_id text,
  external_account_name text,
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'expired', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dash_speed_users enable row level security;
alter table public.dash_speed_dashboards enable row level security;
alter table public.dash_speed_widgets enable row level security;
alter table public.dash_speed_subscriptions enable row level security;
alter table public.dash_speed_integration_connections enable row level security;

create policy "dash speed users own profile"
on public.dash_speed_users
for all
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "dash speed users own dashboards"
on public.dash_speed_dashboards
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "dash speed users own widgets"
on public.dash_speed_widgets
for all
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.dash_speed_dashboards d
    where d.id = dashboard_id
      and d.user_id = auth.uid()
  )
);

create policy "dash speed users own subscriptions"
on public.dash_speed_subscriptions
for select
using (auth.uid() = user_id);

create policy "dash speed users own integrations"
on public.dash_speed_integration_connections
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists dash_speed_dashboards_user_id_idx
  on public.dash_speed_dashboards(user_id);

create index if not exists dash_speed_widgets_dashboard_id_idx
  on public.dash_speed_widgets(dashboard_id);

create index if not exists dash_speed_widgets_user_id_idx
  on public.dash_speed_widgets(user_id);

create index if not exists dash_speed_integrations_user_provider_idx
  on public.dash_speed_integration_connections(user_id, provider);
