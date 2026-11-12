-- Acesso da rede da Meta é sempre robô, mesmo com navegador do app (FBAN/FBIOS/Instagram).
-- Conferido em 12/11/2026: 78 sessões em 30 dias assim, todas de data center da Meta
-- (Prineville, Forest City, Luleå, Clonee...), 0 checkout e 0 venda: é o revisor de
-- anúncio disfarçado de app. Gente de verdade no app usa a internet da operadora.
-- Mesma regra do robô v1.4.2 (track-worker/src/bots.js) e do TrackSpeed (023).
create or replace function public.track_events_marca_robo()
returns trigger language plpgsql as $$
begin
  new.is_bot := public.track_is_bot(new.user_agent, new.source, new.event_name)
    or (new.source = 'capi' and new.event_name <> 'Purchase' and public.track_is_meta_ip(new.ip));
  return new;
end;
$$;

-- As visitas que já tinham passado viram robô (não apaga nada, só tira do painel).
update public.track_events
set is_bot = true
where not is_bot
  and source = 'capi'
  and event_name <> 'Purchase'
  and public.track_is_meta_ip(ip);
