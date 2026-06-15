-- Guarda a oferta da Hotmart em cada venda e permite restringir um projeto
-- a ofertas especificas de um produto.

alter table public.vendas
  add column if not exists oferta_codigo text,
  add column if not exists oferta_nome text,
  add column if not exists oferta_descricao text,
  add column if not exists oferta_preco numeric,
  add column if not exists oferta_moeda text,
  add column if not exists plano_id text,
  add column if not exists plano_nome text;

update public.vendas
set
  oferta_codigo = coalesce(
    oferta_codigo,
    hotmart_payload->'data'->'purchase'->'offer'->>'code',
    hotmart_payload->'data'->'purchase'->'offer'->>'name',
    hotmart_payload->'data'->'purchase'->'offer'->>'description'
  ),
  oferta_nome = coalesce(
    oferta_nome,
    hotmart_payload->'data'->'purchase'->'offer'->>'name',
    hotmart_payload->'data'->'purchase'->'offer'->>'description',
    hotmart_payload->'data'->'purchase'->'offer'->>'code'
  ),
  oferta_descricao = coalesce(
    oferta_descricao,
    hotmart_payload->'data'->'purchase'->'offer'->>'description'
  ),
  oferta_preco = coalesce(
    oferta_preco,
    nullif(hotmart_payload->'data'->'purchase'->'original_offer_price'->>'value', '')::numeric,
    nullif(hotmart_payload->'data'->'purchase'->'price'->>'value', '')::numeric
  ),
  oferta_moeda = coalesce(
    oferta_moeda,
    hotmart_payload->'data'->'purchase'->'original_offer_price'->>'currency_value',
    hotmart_payload->'data'->'purchase'->'price'->>'currency_value'
  ),
  plano_id = coalesce(plano_id, hotmart_payload->'data'->'subscription'->'plan'->>'id'),
  plano_nome = coalesce(plano_nome, hotmart_payload->'data'->'subscription'->'plan'->>'name')
where hotmart_payload is not null;

alter table public.projeto_produtos
  add column if not exists todas_ofertas boolean not null default true;

create table if not exists public.projeto_produto_ofertas (
  projeto_id uuid not null references public.projetos(id) on delete cascade,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  oferta_codigo text not null,
  oferta_nome text not null,
  oferta_preco numeric,
  oferta_moeda text,
  created_at timestamptz not null default now(),
  primary key (projeto_id, produto_id, oferta_codigo)
);

create index if not exists vendas_hotmart_produto_oferta_idx
  on public.vendas (hotmart_produto_id, oferta_codigo);

create index if not exists projeto_produto_ofertas_projeto_idx
  on public.projeto_produto_ofertas (projeto_id, produto_id);

notify pgrst, 'reload schema';
