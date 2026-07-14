-- Migration 051: checagem opcional de cloacker por página monitorada
--
-- Algumas páginas usam cloacker (mostra uma página "black" pra visitantes reais
-- e uma "white" seguro pra revisores/bots do Meta Ads). Pra saber se o cloacker
-- está entregando a página certa, o dono marca uma página como "verificar_cloaker"
-- e coloca um comentário escondido tipo <!-- pagina:black --> no HTML da página
-- black (fora do alcance de qualquer bot de revisão, só o nosso checker sabe
-- procurar por isso). Nem toda página monitorada usa cloacker — por isso é
-- opcional, desligado por padrão.

ALTER TABLE public.monitored_pages
  ADD COLUMN IF NOT EXISTS verificar_cloaker boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ultimo_status_cloaker text, -- 'ok' | 'falhou' | null (nunca checado)
  ADD COLUMN IF NOT EXISTS cloaker_problema_desde timestamptz; -- null quando 'ok'
