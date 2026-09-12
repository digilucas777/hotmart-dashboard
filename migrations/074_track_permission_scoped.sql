-- Antes, "admin" era a única forma de acessar a aba de Rastreamento — e
-- "admin" também dá acesso a TUDO no painel (vendas de todo mundo, sites,
-- perfis de outros usuários, pastas, etc). Isso impedia liberar essa aba pra
-- outra pessoa (ex: um media buyer cuidando do próprio produto) sem torná-la
-- dona do sistema inteiro.
--
-- Esta migration:
-- 1. Cria uma permissão específica (pode_gerenciar_rastreamento) que libera
--    só esta aba, sem afetar mais nada.
-- 2. Remove as policies "admin sees all track_*" — o acesso por linha volta a
--    ser estritamente por dono (auth.uid() = user_id), pra ninguém (nem quem
--    tem essa nova permissão, nem um admin comum) ver instalação de outra
--    pessoa via banco. A checagem de acesso à ABA continua sendo feita em
--    código (role=admin OU pode_gerenciar_rastreamento — ver
--    app/api/track/_utils.ts), só o RLS de cada LINHA fica mais restrito.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS pode_gerenciar_rastreamento boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "admin sees all track_installations" ON public.track_installations;
DROP POLICY IF EXISTS "admin sees all track_pixels" ON public.track_pixels;
DROP POLICY IF EXISTS "admin sees all track_domains" ON public.track_domains;
DROP POLICY IF EXISTS "admin sees all track_triggers" ON public.track_triggers;
DROP POLICY IF EXISTS "admin sees all track_events" ON public.track_events;
