-- Migration 057: detalhe por visitante no painel de eventos do Rastreamento
--
-- Aditivo apenas. O painel (Etapa 4) só mostrava evento + horário — o
-- usuário quer ver de onde veio (Facebook Ads via fbc, ou direto/orgânico),
-- geolocalização, IP e os parâmetros UTM do link clicado. Esses campos já
-- eram capturados/derivados no Worker (geo pro advanced matching hasheado
-- da Meta) mas descartados depois de usados — agora também guardamos a
-- versão crua (não hasheada) só pro nosso próprio diagnóstico interno.

ALTER TABLE public.track_events
  ADD COLUMN IF NOT EXISTS geo_city text,
  ADD COLUMN IF NOT EXISTS geo_region text,
  ADD COLUMN IF NOT EXISTS geo_country text,
  ADD COLUMN IF NOT EXISTS geo_postal_code text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text;
