-- Índice só das vendas (Purchase) por instalação. A lista de leads descobre os
-- produtos de cada instalação pelas vendas dela (pra ligar o abandono da
-- Hotmart); sem isso o banco lia todos os eventos da instalação (20 s+).
create index if not exists idx_track_events_purchase_inst
  on public.track_events (installation_id, received_at)
  where event_name = 'Purchase';
