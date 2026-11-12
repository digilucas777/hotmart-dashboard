-- vendas_do_projeto_leve: confere o acesso ao projeto UMA vez por busca, em vez de o
-- RLS de vendas conferir venda por venda (gestor no período máximo do Rubens: 6s).
-- Mesma regra do RLS "select vendas (consolidada)":
--   admin ou dono do projeto: vê tudo;
--   gestor com pode_visualizar no projeto: vê a partir de dados_visiveis_a_partir;
--   qualquer outro: não vê nada.
-- SECURITY DEFINER só nesta função interna; get_vendas_graficos/get_vendas_tabela
-- continuam invoker (a tabela ainda passa pelo RLS ao abrir as 250 vendas).
create or replace function public.vendas_do_projeto_leve(
  p_projeto_id uuid, p_from timestamptz, p_to timestamptz,
  p_origens text[] default null, p_afiliados text[] default null
)
returns table(id uuid, data_venda timestamptz, status text, moeda text, valor numeric, produto text, pais text, forma_pagamento text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with acesso as (
    select case
      when (select is_admin()) or exists (select 1 from projetos pr where pr.id = p_projeto_id and pr.user_id = (select auth.uid()))
        then timestamptz '-infinity'
      else (
        select min(coalesce(udp.dados_visiveis_a_partir::timestamptz, timestamptz '-infinity'))
        from user_dashboard_permissions udp
        where udp.projeto_id = p_projeto_id and udp.user_id = (select auth.uid()) and udp.pode_visualizar = true
      )
    end as desde
  ),
  prods as (
    select pr.id as produto_id, pr.hotmart_id, pp.todas_ofertas
    from projeto_produtos pp join produtos pr on pr.id = pp.produto_id
    where pp.projeto_id = p_projeto_id
  ),
  ofertas as (
    select ppo.produto_id, ppo.oferta_codigo
    from projeto_produto_ofertas ppo
    where ppo.projeto_id = p_projeto_id
  ),
  base as (
    select v.id, v.data_venda, v.status, v.moeda, coalesce(v.valor_operacional_final, 0) as valor,
           v.produto, v.pais, v.forma_pagamento, v.origem, v.afiliado_nome,
           coalesce(v.oferta_codigo, '') as oferta_real,
           oferta_sufixo(v.hotmart_produto_id, v.origem, v.data_venda) as sufixo,
           p.produto_id, p.todas_ofertas
    from vendas v
    join prods p on p.hotmart_id = v.hotmart_produto_id
    where v.hotmart_produto_id = any(array(select hotmart_id from prods))
      and v.data_venda >= p_from and v.data_venda < p_to
      and v.data_venda >= (select desde from acesso)
  )
  select b.id, b.data_venda, b.status, b.moeda, b.valor, b.produto, b.pais, b.forma_pagamento
  from base b
  where (
      case
        when b.sufixo <> '' then exists (select 1 from ofertas o where o.produto_id = b.produto_id and o.oferta_codigo = b.oferta_real || b.sufixo)
        when b.todas_ofertas is distinct from false then true
        else exists (select 1 from ofertas o where o.produto_id = b.produto_id and o.oferta_codigo = b.oferta_real)
      end
    )
    and (coalesce(cardinality(p_origens), 0) = 0 or origem_legivel(b.origem) = any(p_origens))
    and (coalesce(cardinality(p_afiliados), 0) = 0 or b.afiliado_nome = any(p_afiliados))
$$;

revoke all on function public.vendas_do_projeto_leve(uuid, timestamptz, timestamptz, text[], text[]) from public, anon;
grant execute on function public.vendas_do_projeto_leve(uuid, timestamptz, timestamptz, text[], text[]) to authenticated;
