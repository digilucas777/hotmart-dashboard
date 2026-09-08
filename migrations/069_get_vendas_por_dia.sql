-- Gráfico combinado ("Faturamento + Vendas por Dia") ficava lento e às vezes dava
-- erro (precisava clicar "tentar novamente"): ele buscava vendas cruas de um mês+
-- inteiro (milhares de linhas, várias páginas) só pra somar por dia — o mesmo tipo
-- de trabalho que vendas_resumo_diario já faz. Essa função lê o resumo diário
-- (poucas linhas, já pronto) agrupado por dia em vez de escanear `vendas` linha a
-- linha — mesma lógica de "produtos/ofertas permitidos" de get_vendas_summary_v2,
-- só que sem colapsar em uma linha só.
--
-- Não serve pra "Hoje"/"Ontem" (o gráfico precisa de hora em hora nesses casos,
-- e o resumo só tem granularidade de dia) — essas duas continuam vindo de uma
-- busca crua bem pequena (1-2 dias, sempre rápida, sem paginação).
create or replace function get_vendas_por_dia(p_projeto_id uuid, p_from timestamptz, p_to timestamptz)
returns table(dia date, status text, moeda text, cnt bigint, total numeric)
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
  )
  select r.data, r.status, r.moeda, sum(r.cnt)::bigint as cnt, coalesce(sum(r.total), 0) as total
  from vendas_resumo_diario r
  join allowed a on a.hotmart_id = r.hotmart_produto_id
  where r.data >= (p_from at time zone 'America/Sao_Paulo')::date
    and r.data <= ((p_to - interval '1 second') at time zone 'America/Sao_Paulo')::date
    and (
      a.todas_ofertas is distinct from false
      or exists (
        select 1 from allowed_ofertas ao
        where ao.hotmart_id = r.hotmart_produto_id and ao.oferta_codigo = r.oferta_codigo
      )
    )
  group by r.data, r.status, r.moeda;
$$;
