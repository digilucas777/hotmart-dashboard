create table if not exists public.projeto_custos (
  id          uuid default gen_random_uuid() primary key,
  projeto_id  uuid not null references public.projetos(id) on delete cascade,
  data        date not null,
  custo_brl   numeric(12,2) not null default 0,
  descricao   text,
  created_at  timestamptz default now()
);

create index if not exists projeto_custos_projeto_data_idx on public.projeto_custos (projeto_id, data);

alter table public.projeto_custos enable row level security;

create policy "Users can manage their project costs"
  on public.projeto_custos
  for all
  using (
    exists (
      select 1 from public.projetos p
      where p.id = projeto_custos.projeto_id
        and p.user_id = auth.uid()
    )
  );
