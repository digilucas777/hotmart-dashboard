-- Resumo diário de vendas (aditivo — não mexe em `vendas`, só lê dela).
-- Objetivo: trocar de projeto/período/filtro no dashboard passa a ler um
-- resumo já pronto (poucas linhas por dia) em vez de escanear as vendas
-- individuais toda vez — velocidade deixa de depender de quanto acumulou.
--
-- Granularidade: produto + oferta + dia + status + moeda. Suficiente pra
-- reconstruir qualquer intervalo de datas usado no app (todos os presets
-- são alinhados em dias inteiros; "Hoje" some até agora, mas não existe
-- venda no futuro dentro do próprio dia, então bate igual).
create table if not exists vendas_resumo_diario (
  hotmart_produto_id text not null,
  oferta_codigo text not null default '', -- '' = venda sem oferta específica associada
  data date not null,
  status text not null,
  moeda text not null,
  cnt bigint not null default 0,
  total numeric not null default 0,
  primary key (hotmart_produto_id, oferta_codigo, data, status, moeda)
);

create index if not exists idx_vendas_resumo_diario_data on vendas_resumo_diario (data);

alter table vendas_resumo_diario enable row level security;

-- Mesma regra de leitura de `vendas` hoje (is_admin() OR compartilhado OR dono),
-- só que contra essa tabela pequena em vez da tabela de vendas inteira.
create policy "select vendas_resumo_diario" on vendas_resumo_diario
for select
using (
  is_admin()
  or exists (
    select 1
    from produtos p
      join projeto_produtos pp on pp.produto_id = p.id
      join user_dashboard_permissions udp on udp.projeto_id = pp.projeto_id
    where p.hotmart_id = vendas_resumo_diario.hotmart_produto_id
      and udp.user_id = (select auth.uid())
      and udp.pode_visualizar = true
  )
  or exists (
    select 1
    from produtos p
      join projeto_produtos pp on pp.produto_id = p.id
      join projetos pr on pr.id = pp.projeto_id
    where p.hotmart_id = vendas_resumo_diario.hotmart_produto_id
      and pr.user_id = (select auth.uid())
  )
);

-- Só o service role (webhook, backend) escreve aqui — nunca o navegador.
create policy "service role escreve vendas_resumo_diario" on vendas_resumo_diario
for all
to service_role
using (true)
with check (true);

-- Backfill único: todo o histórico de `vendas` vira resumo agora.
insert into vendas_resumo_diario (hotmart_produto_id, oferta_codigo, data, status, moeda, cnt, total)
select
  hotmart_produto_id,
  coalesce(oferta_codigo, ''),
  data_venda::date,
  status,
  moeda,
  count(*),
  coalesce(sum(valor_operacional_final), 0)
from vendas
where hotmart_produto_id is not null and data_venda is not null and status is not null and moeda is not null
group by 1, 2, 3, 4, 5
on conflict (hotmart_produto_id, oferta_codigo, data, status, moeda)
do update set cnt = excluded.cnt, total = excluded.total;

-- Réplica de get_vendas_summary, mesma lógica de "allowed"/"allowed_ofertas",
-- só que lendo o resumo em vez de escanear `vendas` linha a linha.
create or replace function get_vendas_summary_v2(p_projeto_id uuid, p_from timestamptz, p_to timestamptz)
returns table(status text, moeda text, cnt bigint, total numeric)
language sql stable
set search_path to 'public'
as $$
  with allowed as (
    select pr.hotmart_id, pp.todas_ofertas
    from projeto_produtos pp
    join produtos pr on pr.id = pp.produto_id
    where pp.projeto_id = p_projeto_id
  ),
  allowed_ofertas as (
    select pr.hotmart_id, ppo.oferta_codigo
    from projeto_produto_ofertas ppo
    join produtos pr on pr.id = ppo.produto_id
    where ppo.projeto_id = p_projeto_id
  ),
  filtrado as (
    select r.status, r.moeda, r.cnt, r.total
    from vendas_resumo_diario r
    join allowed a on a.hotmart_id = r.hotmart_produto_id
    -- p_to é exclusivo (mesma semântica de get_vendas_summary original) —
    -- subtrai 1s antes de truncar em dia, senão um p_to exatamente na
    -- meia-noite do dia seguinte incluiria esse dia seguinte inteiro. Cast
    -- direto pra date (sem at time zone) pra bater com o backfill, que usa
    -- data_venda::date no mesmo fuso de sessão.
    where r.data >= p_from::date
      and r.data <= (p_to - interval '1 second')::date
      and (
        a.todas_ofertas is distinct from false
        or exists (
          select 1 from allowed_ofertas ao
          where ao.hotmart_id = r.hotmart_produto_id and ao.oferta_codigo = r.oferta_codigo
        )
      )
  )
  select status, moeda, sum(cnt)::bigint as cnt, coalesce(sum(total), 0) as total
  from filtrado
  group by status, moeda;
$$;
