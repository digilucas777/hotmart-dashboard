-- Mantém vendas_resumo_diario atualizado a cada venda processada pelo
-- webhook. Em vez de somar/subtrair delta em JS (arriscado de acertar em
-- toda correção/reenvio), recalcula do zero só o balde afetado
-- (produto + oferta + dia) direto de `vendas` — idempotente, sempre correto,
-- barato (poucas linhas por dia, nunca escaneia a tabela toda).
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
