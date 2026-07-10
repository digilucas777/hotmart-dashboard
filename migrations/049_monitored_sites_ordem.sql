-- Migration 049: ordem manual dos sites monitorados (drag-and-drop em /sites)

ALTER TABLE public.monitored_sites ADD COLUMN ordem integer NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at ASC) - 1 AS rn
  FROM public.monitored_sites
)
UPDATE public.monitored_sites s
SET ordem = ranked.rn
FROM ranked
WHERE s.id = ranked.id;

CREATE INDEX idx_monitored_sites_ordem ON public.monitored_sites (user_id, ordem);
