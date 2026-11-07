-- Índice do painel de rastreamento: carrega só as colunas que o painel e a
-- lista de leads leem, pra o banco não abrir cada linha inteira (as linhas têm
-- o conteúdo bruto do evento e ficam pesadas). Período "Total" levava 30 s.
create index if not exists idx_track_events_painel
  on public.track_events (installation_id, received_at)
  include (event_name, source, is_bot, session_id, session_hit, capi_send_ok, geo_country, fbc, fbp);
