-- Migration 048: monitoramento de sites/páginas de anúncio
--
-- Cada usuário cadastra os sites (e páginas dentro deles) que anuncia no Meta
-- Ads. Um bot externo (GitHub Actions, ver .github/workflows/check-sites.yml)
-- chama app/api/cron/check-sites de hora em hora, que atualiza o status de
-- cada página e dispara push quando alguma cai, dá erro ou fica lenta.

CREATE TABLE public.monitored_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL,
  dominio text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.monitored_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.monitored_sites(id) ON DELETE CASCADE,
  url text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  -- resultado da última checagem
  ultimo_status text, -- 'ok' | 'lento' | 'fora_do_ar' | 'erro_servidor' | 'nao_encontrada'
  ultimo_status_code integer,
  ultimo_tempo_ms integer,
  ultima_checagem_em timestamptz,
  problema_desde timestamptz, -- null quando 'ok'; marca desde quando está com problema
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_monitored_pages_site_id ON public.monitored_pages (site_id);
CREATE INDEX idx_monitored_pages_ativo ON public.monitored_pages (ativo) WHERE ativo = true;

ALTER TABLE public.monitored_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitored_pages ENABLE ROW LEVEL SECURITY;

-- dono gerencia os próprios sites; admin (helper is_admin(), migration 041) só lê todos
CREATE POLICY "dono ve e gerencia seus sites" ON public.monitored_sites
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin ve todos os sites" ON public.monitored_sites
  FOR SELECT USING (public.is_admin());

CREATE POLICY "dono ve e gerencia suas paginas" ON public.monitored_pages
  FOR ALL USING (EXISTS (SELECT 1 FROM public.monitored_sites s WHERE s.id = site_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.monitored_sites s WHERE s.id = site_id AND s.user_id = auth.uid()));
CREATE POLICY "admin ve todas as paginas" ON public.monitored_pages
  FOR SELECT USING (public.is_admin());
