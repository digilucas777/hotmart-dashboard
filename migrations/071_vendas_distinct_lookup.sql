-- Item 3 da auditoria de performance (2026-09-08): get_distinct_origens/afiliados/ofertas
-- escaneiam `vendas` inteira (filtrando só por hotmart_produto_id, sem corte de tempo) toda
-- vez que alguém abre um filtro no dashboard — pg_stat_statements: ~2.470-2.475 chamadas
-- cada, média 1,7-1,9s, pico ~7,9-8,0s. Mesmo padrão já resolvido pra agregados
-- (vendas_resumo_diario): mantém um recorte pequeno e pronto, atualizado a cada venda, em
-- vez de recalcular escaneando a tabela inteira a cada leitura.
--
-- Diferença pro resumo diário: aqui não precisa de advisory lock nem de
-- delete+insert do balde inteiro — é só "esse produto já teve essa origem/afiliado/
-- oferta alguma vez?", um INSERT ... ON CONFLICT DO NOTHING (origem/afiliado, nunca muda
-- depois de existir) ou DO UPDATE só se a venda for mais recente (oferta, cujo nome/preço/
-- moeda podem mudar ao longo do tempo) — cada um é uma operação de 1 linha, sem corrida
-- possível entre chamadas concorrentes.

create table if not exists vendas_distinct_origem (
  hotmart_produto_id text not null,
  origem text not null,
  primary key (hotmart_produto_id, origem)
);

create table if not exists vendas_distinct_afiliado (
  hotmart_produto_id text not null,
  afiliado_nome text not null,
  primary key (hotmart_produto_id, afiliado_nome)
);

create table if not exists vendas_distinct_oferta (
  hotmart_produto_id text not null,
  oferta_codigo text not null,
  oferta_nome text,
  oferta_preco numeric,
  oferta_moeda text,
  data_venda timestamptz not null,
  primary key (hotmart_produto_id, oferta_codigo)
);

alter table vendas_distinct_origem enable row level security;
alter table vendas_distinct_afiliado enable row level security;
alter table vendas_distinct_oferta enable row level security;

-- Mesma regra de leitura de `vendas` (dono, compartilhado ou admin), só que contra essas
-- tabelas pequenas em vez da tabela de vendas inteira — idêntica ao padrão já usado em
-- vendas_resumo_diario (migration 064).
create policy "select vendas_distinct_origem" on vendas_distinct_origem
for select
using (
  is_admin()
  or exists (
    select 1 from produtos p join projeto_produtos pp on pp.produto_id = p.id
      join user_dashboard_permissions udp on udp.projeto_id = pp.projeto_id
    where p.hotmart_id = vendas_distinct_origem.hotmart_produto_id
      and udp.user_id = (select auth.uid()) and udp.pode_visualizar = true
  )
  or exists (
    select 1 from produtos p join projeto_produtos pp on pp.produto_id = p.id
      join projetos pr on pr.id = pp.projeto_id
    where p.hotmart_id = vendas_distinct_origem.hotmart_produto_id
      and pr.user_id = (select auth.uid())
  )
);
create policy "service role escreve vendas_distinct_origem" on vendas_distinct_origem
for all to service_role using (true) with check (true);

create policy "select vendas_distinct_afiliado" on vendas_distinct_afiliado
for select
using (
  is_admin()
  or exists (
    select 1 from produtos p join projeto_produtos pp on pp.produto_id = p.id
      join user_dashboard_permissions udp on udp.projeto_id = pp.projeto_id
    where p.hotmart_id = vendas_distinct_afiliado.hotmart_produto_id
      and udp.user_id = (select auth.uid()) and udp.pode_visualizar = true
  )
  or exists (
    select 1 from produtos p join projeto_produtos pp on pp.produto_id = p.id
      join projetos pr on pr.id = pp.projeto_id
    where p.hotmart_id = vendas_distinct_afiliado.hotmart_produto_id
      and pr.user_id = (select auth.uid())
  )
);
create policy "service role escreve vendas_distinct_afiliado" on vendas_distinct_afiliado
for all to service_role using (true) with check (true);

create policy "select vendas_distinct_oferta" on vendas_distinct_oferta
for select
using (
  is_admin()
  or exists (
    select 1 from produtos p join projeto_produtos pp on pp.produto_id = p.id
      join user_dashboard_permissions udp on udp.projeto_id = pp.projeto_id
    where p.hotmart_id = vendas_distinct_oferta.hotmart_produto_id
      and udp.user_id = (select auth.uid()) and udp.pode_visualizar = true
  )
  or exists (
    select 1 from produtos p join projeto_produtos pp on pp.produto_id = p.id
      join projetos pr on pr.id = pp.projeto_id
    where p.hotmart_id = vendas_distinct_oferta.hotmart_produto_id
      and pr.user_id = (select auth.uid())
  )
);
create policy "service role escreve vendas_distinct_oferta" on vendas_distinct_oferta
for all to service_role using (true) with check (true);

-- Backfill único do histórico.
insert into vendas_distinct_origem (hotmart_produto_id, origem)
select distinct hotmart_produto_id, origem
from vendas
where hotmart_produto_id is not null and origem is not null
on conflict (hotmart_produto_id, origem) do nothing;

insert into vendas_distinct_afiliado (hotmart_produto_id, afiliado_nome)
select distinct hotmart_produto_id, afiliado_nome
from vendas
where hotmart_produto_id is not null and afiliado_nome is not null and afiliado_nome <> ''
on conflict (hotmart_produto_id, afiliado_nome) do nothing;

insert into vendas_distinct_oferta (hotmart_produto_id, oferta_codigo, oferta_nome, oferta_preco, oferta_moeda, data_venda)
select distinct on (hotmart_produto_id, oferta_codigo)
  hotmart_produto_id, oferta_codigo, oferta_nome, oferta_preco, oferta_moeda, data_venda
from vendas
where hotmart_produto_id is not null and oferta_codigo is not null
order by hotmart_produto_id, oferta_codigo, data_venda desc
on conflict (hotmart_produto_id, oferta_codigo) do update
  set oferta_nome = excluded.oferta_nome, oferta_preco = excluded.oferta_preco,
      oferta_moeda = excluded.oferta_moeda, data_venda = excluded.data_venda;

-- Réplica exata da assinatura/semântica das 3 funções originais — mesmo filtro
-- (hotmart_produto_id = ANY(hotmart_ids)), só lendo o recorte pequeno em vez de `vendas`.
create or replace function get_distinct_origens_v2(hotmart_ids text[])
returns table(origem text)
language sql stable
set search_path to 'public'
as $$
  select origem from vendas_distinct_origem where hotmart_produto_id = any(hotmart_ids);
$$;

create or replace function get_distinct_afiliados_v2(hotmart_ids text[])
returns table(afiliado_nome text)
language sql stable
set search_path to 'public'
as $$
  select afiliado_nome from vendas_distinct_afiliado where hotmart_produto_id = any(hotmart_ids);
$$;

create or replace function get_distinct_ofertas_v2(hotmart_ids text[])
returns table(hotmart_produto_id text, oferta_codigo text, oferta_nome text, oferta_preco numeric, oferta_moeda text)
language sql stable
set search_path to 'public'
as $$
  select hotmart_produto_id, oferta_codigo, oferta_nome, oferta_preco, oferta_moeda
  from vendas_distinct_oferta where hotmart_produto_id = any(hotmart_ids);
$$;

-- Mantém o recorte em dia a cada venda nova/corrigida — sempre relê o estado atual de
-- `vendas` pra essa transação (idempotente, seguro chamar mais de uma vez pra mesma venda,
-- ex: quando a origem é descoberta depois via API em segundo plano).
create or replace function refresh_vendas_distinct_by_hotmart_id(p_hotmart_id text)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_produto_id text;
  v_origem text;
  v_afiliado text;
  v_oferta_codigo text;
  v_oferta_nome text;
  v_oferta_preco numeric;
  v_oferta_moeda text;
  v_data_venda timestamptz;
begin
  select hotmart_produto_id, origem, afiliado_nome, oferta_codigo, oferta_nome, oferta_preco, oferta_moeda, data_venda
    into v_produto_id, v_origem, v_afiliado, v_oferta_codigo, v_oferta_nome, v_oferta_preco, v_oferta_moeda, v_data_venda
  from vendas
  where hotmart_id = p_hotmart_id;

  if v_produto_id is null then
    return;
  end if;

  if v_origem is not null then
    insert into vendas_distinct_origem (hotmart_produto_id, origem)
    values (v_produto_id, v_origem)
    on conflict (hotmart_produto_id, origem) do nothing;
  end if;

  if v_afiliado is not null and v_afiliado <> '' then
    insert into vendas_distinct_afiliado (hotmart_produto_id, afiliado_nome)
    values (v_produto_id, v_afiliado)
    on conflict (hotmart_produto_id, afiliado_nome) do nothing;
  end if;

  if v_oferta_codigo is not null then
    insert into vendas_distinct_oferta (hotmart_produto_id, oferta_codigo, oferta_nome, oferta_preco, oferta_moeda, data_venda)
    values (v_produto_id, v_oferta_codigo, v_oferta_nome, v_oferta_preco, v_oferta_moeda, v_data_venda)
    on conflict (hotmart_produto_id, oferta_codigo) do update
      set oferta_nome = excluded.oferta_nome, oferta_preco = excluded.oferta_preco,
          oferta_moeda = excluded.oferta_moeda, data_venda = excluded.data_venda
      where excluded.data_venda >= vendas_distinct_oferta.data_venda;
  end if;
end;
$$;

-- Mesma coisa pra vendas do Digistore24 (chave própria, sem hotmart_id) — espelha o par
-- refresh_vendas_resumo_diario_by_hotmart_id / _by_digistore_id já existente.
create or replace function refresh_vendas_distinct_by_digistore_id(p_digistore_id text)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_produto_id text;
  v_origem text;
  v_afiliado text;
  v_oferta_codigo text;
  v_oferta_nome text;
  v_oferta_preco numeric;
  v_oferta_moeda text;
  v_data_venda timestamptz;
begin
  select hotmart_produto_id, origem, afiliado_nome, oferta_codigo, oferta_nome, oferta_preco, oferta_moeda, data_venda
    into v_produto_id, v_origem, v_afiliado, v_oferta_codigo, v_oferta_nome, v_oferta_preco, v_oferta_moeda, v_data_venda
  from vendas
  where digistore_id = p_digistore_id;

  if v_produto_id is null then
    return;
  end if;

  if v_origem is not null then
    insert into vendas_distinct_origem (hotmart_produto_id, origem)
    values (v_produto_id, v_origem)
    on conflict (hotmart_produto_id, origem) do nothing;
  end if;

  if v_afiliado is not null and v_afiliado <> '' then
    insert into vendas_distinct_afiliado (hotmart_produto_id, afiliado_nome)
    values (v_produto_id, v_afiliado)
    on conflict (hotmart_produto_id, afiliado_nome) do nothing;
  end if;

  if v_oferta_codigo is not null then
    insert into vendas_distinct_oferta (hotmart_produto_id, oferta_codigo, oferta_nome, oferta_preco, oferta_moeda, data_venda)
    values (v_produto_id, v_oferta_codigo, v_oferta_nome, v_oferta_preco, v_oferta_moeda, v_data_venda)
    on conflict (hotmart_produto_id, oferta_codigo) do update
      set oferta_nome = excluded.oferta_nome, oferta_preco = excluded.oferta_preco,
          oferta_moeda = excluded.oferta_moeda, data_venda = excluded.data_venda
      where excluded.data_venda >= vendas_distinct_oferta.data_venda;
  end if;
end;
$$;
