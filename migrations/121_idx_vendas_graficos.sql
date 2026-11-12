-- Índice "de cobertura" pros gráficos/tabela (get_vendas_graficos / get_vendas_tabela):
-- tem todas as colunas que essas buscas usam, então o banco não precisa abrir cada
-- venda inteira (com o hotmart_payload pesado). Período máximo do Pedro: ~13s para ~1,5s.
set lock_timeout = '5s';
drop index if exists public.idx_vendas_graficos;
create index idx_vendas_graficos on public.vendas (hotmart_produto_id, data_venda)
  include (id, status, moeda, valor_operacional_final, pais, forma_pagamento, origem, oferta_codigo, afiliado_nome, produto);
