CREATE OR REPLACE FUNCTION get_distinct_ofertas(hotmart_ids text[])
RETURNS TABLE(hotmart_produto_id text, oferta_codigo text, oferta_nome text, oferta_preco numeric, oferta_moeda text)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (hotmart_produto_id, oferta_codigo)
    hotmart_produto_id, oferta_codigo, oferta_nome, oferta_preco, oferta_moeda
  FROM vendas
  WHERE hotmart_produto_id = ANY(hotmart_ids)
    AND oferta_codigo IS NOT NULL
  ORDER BY hotmart_produto_id, oferta_codigo, data_venda DESC;
$$;
