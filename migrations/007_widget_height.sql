alter table public.dashboard_widgets
  add column if not exists height text not null default 'medium';
