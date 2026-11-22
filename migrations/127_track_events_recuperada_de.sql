alter table public.track_events add column if not exists recuperada_de text;
comment on column public.track_events.recuperada_de is 'session_id da visita de onde a origem (fbc/UTM) foi herdada: mesmo aparelho+internet em 30 min (robô 1.4.5)';
