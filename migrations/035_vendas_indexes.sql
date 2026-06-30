-- Índices para acelerar queries de vendas por produto+período (dashboard)
-- Sem CONCURRENTLY pois migrations rodam fora de transação no Supabase Dashboard

CREATE INDEX IF NOT EXISTS idx_vendas_hotmart_produto_id
  ON vendas (hotmart_produto_id);

CREATE INDEX IF NOT EXISTS idx_vendas_data_venda
  ON vendas (data_venda DESC);

CREATE INDEX IF NOT EXISTS idx_vendas_status
  ON vendas (status);

-- Índice composto cobre o padrão principal do dashboard:
-- WHERE hotmart_produto_id = ANY(...) AND data_venda >= ? AND data_venda < ?
-- ORDER BY data_venda DESC
CREATE INDEX IF NOT EXISTS idx_vendas_produto_data
  ON vendas (hotmart_produto_id, data_venda DESC);
