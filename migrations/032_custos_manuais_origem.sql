-- Adiciona coluna origem para identificar a fonte do custo (ex: 'meta_ads', NULL = manual)
ALTER TABLE public.custos_manuais
  ADD COLUMN IF NOT EXISTS origem text;

-- Índice único parcial para permitir upsert por (projeto_id, data, origem)
-- Apenas linhas com origem NOT NULL participam da constraint — custos manuais (origem NULL) não conflitam
CREATE UNIQUE INDEX IF NOT EXISTS custos_manuais_origem_upsert_idx
  ON public.custos_manuais (projeto_id, data, origem)
  WHERE origem IS NOT NULL;
