-- "Período máximo": data da venda mais antiga dos produtos do projeto.
-- Antes o front fazia .in(produtos).order(data_venda asc).limit(1) e o Postgres
-- varria o índice de data inteiro (15s no FABRÍCIO-TRÁFEGO, estourava os 8s).
-- Aqui busca a 1ª venda produto por produto (índice produto+data), em ms.
-- SECURITY INVOKER: o RLS de vendas continua valendo (gestor com
-- dados_visiveis_a_partir só enxerga a partir da data dele).
CREATE OR REPLACE FUNCTION public.get_primeira_venda(p_hotmart_ids text[])
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  select min(x.f)
  from unnest(p_hotmart_ids) h,
  lateral (
    select v.data_venda f from public.vendas v
    where v.hotmart_produto_id = h
    order by v.data_venda
    limit 1
  ) x
$$;

REVOKE ALL ON FUNCTION public.get_primeira_venda(text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_primeira_venda(text[]) TO authenticated;
