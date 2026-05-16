create table if not exists public.projeto_custos (
  id          uuid default gen_random_uuid() primary key,
  projeto_id  uuid references public.projetos(id) on delete cascade,
  data        date not null,
  custo_brl   numeric not null,
  descricao   text,
  created_at  timestamptz default now()
);
