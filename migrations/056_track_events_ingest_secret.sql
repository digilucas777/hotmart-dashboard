-- Migration 056: secret de ingestão pro Worker gravar em track_events
--
-- O Worker (roda fora do Next.js, em contas Cloudflare potencialmente de
-- terceiros no futuro) NÃO recebe a SUPABASE_SERVICE_ROLE_KEY — isso daria
-- acesso total ao banco pra qualquer conta Cloudflare de qualquer instalação.
-- Em vez disso, cada instalação tem seu próprio secret de ingestão: o Worker
-- manda esse secret pra uma rota restrita nossa (app/api/track/events/ingest),
-- que confere e só então grava com privilégio de servidor.

ALTER TABLE public.track_installations
  ADD COLUMN IF NOT EXISTS ingest_secret text;

UPDATE public.track_installations
SET ingest_secret = encode(gen_random_bytes(24), 'hex')
WHERE ingest_secret IS NULL;

ALTER TABLE public.track_installations
  ALTER COLUMN ingest_secret SET NOT NULL;
