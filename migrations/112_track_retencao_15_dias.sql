-- 09/11/2026 (pedido do Lucas): visitas e cliques do rastreamento ficam 15 dias
-- em track_events (antes 45). Depois disso viram só o total por dia em
-- track_events_daily; Purchase, Refund e Chargeback ficam pra sempre.
-- Aplicado direto no banco: cron.alter_job(2) + limpeza em etapas + VACUUM FULL
-- (banco 663 MB -> 294 MB, track_events 385 MB -> 16 MB).
select cron.alter_job(2, command := ' select public.track_prune_events(15) ');
