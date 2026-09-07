-- Bug real encontrado em produção (2026-09-07, poucos minutos depois de ir
-- ao ar): a Hotmart manda o mesmo evento de compra várias vezes em pouco
-- tempo (já documentado antes, HP0896355421/HP1626055519). Duas chamadas
-- concorrentes de refresh_vendas_resumo_diario_by_hotmart_id pro MESMO
-- produto+oferta+dia faziam DELETE+INSERT ao mesmo tempo — uma das duas
-- sempre batia em "duplicate key" (23505) e falhava, deixando aquele balde
-- desatualizado (sem a venda mais recente) até a próxima tentativa bem
-- sucedida. Fix: trava (advisory lock, só pra esse produto+oferta+dia
-- específico) antes do delete+insert — outras chamadas pro MESMO balde
-- esperam a vez em vez de colidir; baldes diferentes continuam
-- totalmente em paralelo, sem impacto de performance.
create or replace function refresh_vendas_resumo_diario_by_hotmart_id(p_hotmart_id text)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_produto_id text;
  v_oferta text;
  v_data date;
begin
  select hotmart_produto_id, coalesce(oferta_codigo, ''), data_venda::date
    into v_produto_id, v_oferta, v_data
  from vendas
  where hotmart_id = p_hotmart_id;

  if v_produto_id is null or v_data is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_produto_id || '|' || v_oferta || '|' || v_data::text, 0));

  delete from vendas_resumo_diario
  where hotmart_produto_id = v_produto_id
    and oferta_codigo = v_oferta
    and data = v_data;

  insert into vendas_resumo_diario (hotmart_produto_id, oferta_codigo, data, status, moeda, cnt, total)
  select hotmart_produto_id, coalesce(oferta_codigo, ''), data_venda::date, status, moeda,
         count(*), coalesce(sum(valor_operacional_final), 0)
  from vendas
  where hotmart_produto_id = v_produto_id
    and coalesce(oferta_codigo, '') = v_oferta
    and data_venda::date = v_data
  group by 1, 2, 3, 4, 5;
end;
$$;

create or replace function refresh_vendas_resumo_diario_by_digistore_id(p_digistore_id text)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_produto_id text;
  v_oferta text;
  v_data date;
begin
  select hotmart_produto_id, coalesce(oferta_codigo, ''), data_venda::date
    into v_produto_id, v_oferta, v_data
  from vendas
  where digistore_id = p_digistore_id;

  if v_produto_id is null or v_data is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_produto_id || '|' || v_oferta || '|' || v_data::text, 0));

  delete from vendas_resumo_diario
  where hotmart_produto_id = v_produto_id
    and oferta_codigo = v_oferta
    and data = v_data;

  insert into vendas_resumo_diario (hotmart_produto_id, oferta_codigo, data, status, moeda, cnt, total)
  select hotmart_produto_id, coalesce(oferta_codigo, ''), data_venda::date, status, moeda,
         count(*), coalesce(sum(valor_operacional_final), 0)
  from vendas
  where hotmart_produto_id = v_produto_id
    and coalesce(oferta_codigo, '') = v_oferta
    and data_venda::date = v_data
  group by 1, 2, 3, 4, 5;
end;
$$;
