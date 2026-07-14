-- Migration 052: organização de páginas monitoradas (nome, ordem, pastas)
--
-- Permite dar um nome customizado a cada página (em vez de só mostrar a URL),
-- arrastar pra reordenar dentro do site, e agrupar páginas em pastas nomeadas
-- dentro de um mesmo site (ex: "Campanha A", "Campanha B").

CREATE TABLE IF NOT EXISTS public.monitored_page_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.monitored_sites(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitored_page_folders_site_id ON public.monitored_page_folders (site_id);

ALTER TABLE public.monitored_pages
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pasta_id uuid REFERENCES public.monitored_page_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_monitored_pages_pasta_id ON public.monitored_pages (pasta_id);

ALTER TABLE public.monitored_page_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dono ve e gerencia suas pastas" ON public.monitored_page_folders
  FOR ALL USING (EXISTS (SELECT 1 FROM public.monitored_sites s WHERE s.id = site_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.monitored_sites s WHERE s.id = site_id AND s.user_id = auth.uid()));

CREATE POLICY "admin ve todas as pastas" ON public.monitored_page_folders
  FOR SELECT USING (public.is_admin());

-- Backfill: dá uma ordem inicial sensata (por data de criação) às páginas já
-- existentes, em vez de deixar todas empatadas em 0.
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY site_id ORDER BY created_at) - 1 AS rn
  FROM public.monitored_pages
)
UPDATE public.monitored_pages p
SET ordem = numbered.rn
FROM numbered
WHERE p.id = numbered.id;
