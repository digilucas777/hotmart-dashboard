-- Gráficos e tabela de transações sem baixar todas as vendas cruas (12/11/2026).
-- Antes o navegador paginava TODAS as vendas do período (49 mil no período máximo do
-- tráfego do Pedro, ~50 lotes, 1,5 min) só pra montar gráficos por dia/produto/país/
-- pagamento/status e a tabela. Agora:
--   get_vendas_graficos: devolve os gráficos já somados (poucas centenas de linhas)
--   get_vendas_tabela:   devolve a tabela 250 por vez (botão "carregar mais")
-- As duas aplicam exatamente o mesmo filtro que o front aplicava nas vendas cruas
-- (filterRowsByOfferSelection + filtros de origem/afiliado do DashboardClient).
-- SECURITY INVOKER: o RLS de vendas continua valendo (gestor só vê o que pode).

-- Sufixo do "balde virtual" da oferta: espelho de virtualSuffix() do DashboardClient
-- e de refresh_vendas_resumo_diario_by_hotmart_id.
create or replace function public.oferta_sufixo(p_produto text, p_origem text, p_data_venda timestamptz)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_produto = '7744143' and lower(coalesce(p_origem, '')) = 'app' then '__app'
    when p_produto = any(array['8294393','8291627','8356204','8356156','8291970','8292135','8294223','8293904','8356130','4855438'])
         and (p_data_venda at time zone 'America/Sao_Paulo')::date >= date '2026-10-16' then '__rec'
    when p_produto = any(array[
      '4804098','4804186','4804654','8294393','5085309','7311693','7359983','4802964','8291627','4803869',
      '4821899','8356204','6101329','7052581','563191','4804539','4804737','8356156','5669621','8291970',
      '7010960','4804439','8292135','7052625','8293571','7360080','8294223','4855438','5608576','8293904',
      '6101509','6101720','6264821','7312372','8356130','7222835']) then
      case
        when lower(coalesce(p_origem, '')) like 'rec%' or lower(coalesce(p_origem, '')) like 'upsell%'
          or lower(coalesce(p_origem, '')) like 'renov%' or lower(coalesce(p_origem, '')) like '%recusada%' then '__rec'
        when lower(coalesce(p_origem, '')) = 'app' or lower(coalesce(p_origem, '')) like 'bannerapp%'
          or lower(coalesce(p_origem, '')) = 'hotmart_site_app' then '__app'
        when p_produto = any(array['7468175','8293571','7360080','8275411','7313804'])
          and (p_data_venda at time zone 'America/Sao_Paulo')::date >= date '2026-10-16' then '__pos1016'
        else ''
      end
    when p_produto = any(array['7468175','8293571','7360080','8275411','7313804'])
      and (p_data_venda at time zone 'America/Sao_Paulo')::date >= date '2026-10-16' then '__pos1016'
    else ''
  end
$$;

-- Origem "legível": espelho de parseOrigem() (lib/utils.ts). JSON com src/sck vira o valor;
-- JSON sem src/sck vira null; texto comum fica como está.
create or replace function public.origem_legivel(p_origem text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare j jsonb;
begin
  if p_origem is null or p_origem = '' then return null; end if;
  if left(ltrim(p_origem), 1) not in ('{', '[') then return p_origem; end if;
  begin
    j := p_origem::jsonb;
  exception when others then
    return p_origem;
  end;
  if jsonb_typeof(j) <> 'object' then return p_origem; end if;
  return coalesce(j->>'src', j->>'sck');
end;
$$;

-- Vendas do projeto no período, já com o filtro de ofertas e de origem/afiliado.
create or replace function public.vendas_do_projeto(
  p_projeto_id uuid, p_from timestamptz, p_to timestamptz,
  p_origens text[] default null, p_afiliados text[] default null
)
returns setof public.vendas
language sql
stable
set search_path to 'public'
as $$
  with prods as (
    select pr.id as produto_id, pr.hotmart_id, pp.todas_ofertas
    from projeto_produtos pp join produtos pr on pr.id = pp.produto_id
    where pp.projeto_id = p_projeto_id
  ),
  ofertas as (
    select ppo.produto_id, ppo.oferta_codigo
    from projeto_produto_ofertas ppo
    where ppo.projeto_id = p_projeto_id
  )
  select v.*
  from vendas v
  join prods p on p.hotmart_id = v.hotmart_produto_id
  where v.hotmart_produto_id = any(array(select hotmart_id from prods))
    and v.data_venda >= p_from and v.data_venda < p_to
    and (
      case
        when oferta_sufixo(v.hotmart_produto_id, v.origem, v.data_venda) <> '' then
          exists (select 1 from ofertas o where o.produto_id = p.produto_id
                  and o.oferta_codigo = coalesce(v.oferta_codigo, '') || oferta_sufixo(v.hotmart_produto_id, v.origem, v.data_venda))
        when p.todas_ofertas is distinct from false then true
        else exists (select 1 from ofertas o where o.produto_id = p.produto_id and o.oferta_codigo = coalesce(v.oferta_codigo, ''))
      end
    )
    and (coalesce(cardinality(p_origens), 0) = 0 or origem_legivel(v.origem) = any(p_origens))
    and (coalesce(cardinality(p_afiliados), 0) = 0 or v.afiliado_nome = any(p_afiliados))
$$;

-- Gráficos já somados. tipo: dia (aprovadas por dia local), produto, pais, pagamento
-- (aprovadas) e status (todas). total = soma de valor_operacional_final (valor oficial).
create or replace function public.get_vendas_graficos(
  p_projeto_id uuid, p_from timestamptz, p_to timestamptz,
  p_origens text[] default null, p_afiliados text[] default null
)
returns table(tipo text, chave text, moeda text, cnt bigint, total numeric)
language sql
stable
set search_path to 'public'
as $$
  with v as (
    select data_venda, status, moeda, produto, pais, forma_pagamento,
           coalesce(valor_operacional_final, 0) as valor
    from vendas_do_projeto(p_projeto_id, p_from, p_to, p_origens, p_afiliados)
  )
  select 'dia', to_char((data_venda at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'), moeda, count(*), sum(valor)
    from v where status = 'approved' group by 2, 3
  union all
  select 'produto', coalesce(produto, ''), moeda, count(*), sum(valor)
    from v where status = 'approved' group by 2, 3
  union all
  select 'pais', pais, moeda, count(*), sum(valor)
    from v where status = 'approved' group by 2, 3
  union all
  select 'pagamento', forma_pagamento, null, count(*), sum(valor)
    from v where status = 'approved' group by 2
  union all
  select 'status', status, null, count(*), sum(valor)
    from v group by 2
$$;

-- Tabela de transações: 250 por vez, da mais nova pra mais antiga, com cursor
-- (data_venda, id) pra "carregar mais" sem OFFSET.
create or replace function public.get_vendas_tabela(
  p_projeto_id uuid, p_from timestamptz, p_to timestamptz,
  p_origens text[] default null, p_afiliados text[] default null,
  p_limit int default 250, p_cursor_data timestamptz default null, p_cursor_id uuid default null
)
returns setof public.vendas
language sql
stable
set search_path to 'public'
as $$
  select * from vendas_do_projeto(p_projeto_id, p_from, p_to, p_origens, p_afiliados) v
  where p_cursor_data is null
     or v.data_venda < p_cursor_data
     or (v.data_venda = p_cursor_data and v.id < p_cursor_id)
  order by v.data_venda desc, v.id desc
  limit least(greatest(coalesce(p_limit, 250), 1), 1000)
$$;

revoke all on function public.vendas_do_projeto(uuid, timestamptz, timestamptz, text[], text[]) from public, anon;
revoke all on function public.get_vendas_graficos(uuid, timestamptz, timestamptz, text[], text[]) from public, anon;
revoke all on function public.get_vendas_tabela(uuid, timestamptz, timestamptz, text[], text[], int, timestamptz, uuid) from public, anon;
grant execute on function public.vendas_do_projeto(uuid, timestamptz, timestamptz, text[], text[]) to authenticated;
grant execute on function public.get_vendas_graficos(uuid, timestamptz, timestamptz, text[], text[]) to authenticated;
grant execute on function public.get_vendas_tabela(uuid, timestamptz, timestamptz, text[], text[], int, timestamptz, uuid) to authenticated;
grant execute on function public.oferta_sufixo(text, text, timestamptz) to authenticated;
grant execute on function public.origem_legivel(text) to authenticated;
