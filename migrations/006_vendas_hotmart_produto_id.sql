alter table public.vendas
  add column if not exists hotmart_produto_id text;

create index if not exists vendas_hotmart_produto_id_idx on public.vendas (hotmart_produto_id);
