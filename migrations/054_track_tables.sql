-- Migration 054: tabelas do módulo de Rastreamento (Meta Pixel + CAPI server-side)
--
-- Aditivo apenas — não altera nenhuma tabela existente. Cada "instalação" é
-- um domínio/cliente que vai rodar um Cloudflare Worker próprio (implementado
-- nas próximas etapas); aqui só criamos o cadastro (Etapa 1, sem deploy real).
--
-- Tokens sensíveis (cloudflare_api_token_encrypted, capi_token_encrypted) são
-- guardados criptografados pela aplicação (lib/crypto.ts) — o Postgres só vê
-- o texto já cifrado.

CREATE TABLE IF NOT EXISTS public.track_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  worker_subdomain text,
  cloudflare_api_token_encrypted text,
  cloudflare_account_id text,
  webhook_platform text NOT NULL DEFAULT 'hotmart',
  webhook_meta_event text NOT NULL DEFAULT 'Purchase',
  webhook_secret text NOT NULL,
  session_enrichment_enabled boolean NOT NULL DEFAULT false,
  session_ttl_days integer NOT NULL DEFAULT 7,
  diagnostico_ativo boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'deployed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_track_installations_user_id ON public.track_installations (user_id);

CREATE TABLE IF NOT EXISTS public.track_pixels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES public.track_installations(id) ON DELETE CASCADE,
  pixel_id text NOT NULL,
  capi_token_encrypted text,
  test_event_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_track_pixels_installation_id ON public.track_pixels (installation_id);

CREATE TABLE IF NOT EXISTS public.track_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES public.track_installations(id) ON DELETE CASCADE,
  domain text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('lp', 'checkout')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_track_domains_installation_id ON public.track_domains (installation_id);

CREATE TABLE IF NOT EXISTS public.track_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES public.track_installations(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('scroll', 'form_submit', 'click_link', 'click_element', 'url_visited', 'time_on_page', 'video_progress')),
  meta_event text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_track_triggers_installation_id ON public.track_triggers (installation_id);

-- Preenchida a partir da Etapa 2/4 (Worker envia os eventos recebidos aqui
-- pra alimentar o dashboard de diagnóstico) — criada agora pra não precisar
-- de outra migration depois.
CREATE TABLE IF NOT EXISTS public.track_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES public.track_installations(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  source text NOT NULL CHECK (source IN ('pixel', 'capi')),
  fbp text,
  fbc text,
  ip text,
  session_id text,
  session_hit boolean NOT NULL DEFAULT false,
  raw_payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_track_events_installation_id ON public.track_events (installation_id);
CREATE INDEX IF NOT EXISTS idx_track_events_received_at ON public.track_events (received_at);

ALTER TABLE public.track_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_pixels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own track_installations" ON public.track_installations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin sees all track_installations" ON public.track_installations
  FOR SELECT USING (public.is_admin());

CREATE POLICY "users manage own track_pixels" ON public.track_pixels
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.track_installations i WHERE i.id = installation_id AND i.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.track_installations i WHERE i.id = installation_id AND i.user_id = auth.uid())
  );
CREATE POLICY "admin sees all track_pixels" ON public.track_pixels
  FOR SELECT USING (public.is_admin());

CREATE POLICY "users manage own track_domains" ON public.track_domains
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.track_installations i WHERE i.id = installation_id AND i.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.track_installations i WHERE i.id = installation_id AND i.user_id = auth.uid())
  );
CREATE POLICY "admin sees all track_domains" ON public.track_domains
  FOR SELECT USING (public.is_admin());

CREATE POLICY "users manage own track_triggers" ON public.track_triggers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.track_installations i WHERE i.id = installation_id AND i.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.track_installations i WHERE i.id = installation_id AND i.user_id = auth.uid())
  );
CREATE POLICY "admin sees all track_triggers" ON public.track_triggers
  FOR SELECT USING (public.is_admin());

CREATE POLICY "users see own track_events" ON public.track_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.track_installations i WHERE i.id = installation_id AND i.user_id = auth.uid())
  );
CREATE POLICY "admin sees all track_events" ON public.track_events
  FOR SELECT USING (public.is_admin());
-- Sem policy de INSERT: a Etapa 2/4 vai gravar aqui usando o
-- SUPABASE_SERVICE_ROLE_KEY a partir do Worker, que ignora RLS automaticamente.
