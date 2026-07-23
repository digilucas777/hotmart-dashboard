-- Migration 055: permite ativar/desativar um gatilho de rastreamento sem excluí-lo
--
-- A ferramenta de referência (Track1Click) deixa cada gatilho com um toggle
-- "Ativo" independente — útil pra pausar um gatilho temporariamente sem perder
-- a configuração. Aditivo, não afeta os gatilhos já cadastrados (default true).

ALTER TABLE public.track_triggers
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
