-- Meta Ads integration foundation for Dash Speed.
-- Adds only isolated integration tables and optional dashboard metadata fields.

alter table public.projetos
  add column if not exists capa_url text,
  add column if not exists cor text,
  add column if not exists categoria text,
  add column if not exists imagem_url text,
  add column if not exists status text not null default 'active';

create table if not exists public.facebook_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  facebook_user_id text not null,
  facebook_user_name text,
  access_token text not null,
  token_type text,
  expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected', 'expired', 'revoked', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, facebook_user_id)
);

create table if not exists public.business_managers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  facebook_connection_id uuid not null references public.facebook_connections(id) on delete cascade,
  bm_id text not null,
  name text not null,
  verification_status text,
  selected boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, bm_id)
);

create table if not exists public.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_manager_id uuid references public.business_managers(id) on delete cascade,
  account_id text not null,
  meta_account_id text not null,
  name text not null,
  currency text,
  timezone_name text,
  account_status integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, meta_account_id)
);

create table if not exists public.dashboard_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.projetos(id) on delete cascade,
  ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(dashboard_id, ad_account_id)
);

alter table public.facebook_connections enable row level security;
alter table public.business_managers enable row level security;
alter table public.ad_accounts enable row level security;
alter table public.dashboard_ad_accounts enable row level security;

create policy "users own facebook connections"
on public.facebook_connections
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own business managers"
on public.business_managers
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own ad accounts"
on public.ad_accounts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own dashboard ad accounts"
on public.dashboard_ad_accounts
for all
using (
  exists (
    select 1
    from public.projetos p
    join public.ad_accounts a on a.id = dashboard_ad_accounts.ad_account_id
    where p.id = dashboard_ad_accounts.dashboard_id
      and a.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.ad_accounts a
    where a.id = dashboard_ad_accounts.ad_account_id
      and a.user_id = auth.uid()
  )
);

create index if not exists facebook_connections_user_id_idx
  on public.facebook_connections(user_id);

create index if not exists business_managers_user_id_idx
  on public.business_managers(user_id);

create index if not exists ad_accounts_user_id_idx
  on public.ad_accounts(user_id);

create index if not exists dashboard_ad_accounts_dashboard_id_idx
  on public.dashboard_ad_accounts(dashboard_id);
