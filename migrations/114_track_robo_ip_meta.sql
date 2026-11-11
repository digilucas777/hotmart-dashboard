-- Robôs da Meta disfarçados de celular: o verificador de anúncio da Meta abre a
-- página com navegador genérico ("Android 10; K") a partir da rede da Meta
-- (AS32934). O filtro por user-agent não pegava. Conferido em 11/11/2026:
-- 585 sessões em 7 dias, 1% de checkout e nenhuma venda.
-- Regra (igual ao robô v1.4.1, track-worker/src/bots.js): IP da Meta E
-- navegador que não é o app do Instagram/Facebook.

create or replace function public.track_is_meta_ip(p_ip text)
returns boolean language plpgsql immutable as $$
begin
  if p_ip is null or btrim(p_ip) = '' then return false; end if;
  -- IP malformado nunca pode travar a gravação do evento
  return p_ip::inet <<= any (array[
        '31.13.24.0/21','31.13.64.0/18','45.64.40.0/22','66.220.144.0/20',
        '69.63.176.0/20','69.171.224.0/19','74.119.76.0/22','102.132.96.0/20',
        '103.4.96.0/22','129.134.0.0/16','147.75.208.0/20','157.240.0.0/16',
        '163.70.128.0/17','173.252.64.0/18','179.60.192.0/22','185.60.216.0/22',
        '185.89.216.0/22','204.15.20.0/22','2a03:2880::/32','2620:0:1c00::/40'
      ]::inet[]);
exception when others then
  return false;
end
$$;

create or replace function public.track_events_marca_robo()
returns trigger language plpgsql as $$
begin
  new.is_bot := public.track_is_bot(new.user_agent, new.source, new.event_name)
    or (new.source = 'capi' and new.event_name <> 'Purchase'
        and public.track_is_meta_ip(new.ip)
        and coalesce(new.user_agent, '') !~* 'FBAN|FBAV|FB_IAB|FBIOS|Instagram');
  return new;
end;
$$;

drop trigger if exists track_events_marca_robo on public.track_events;
create trigger track_events_marca_robo
  before insert or update of user_agent, source, event_name, ip on public.track_events
  for each row execute function public.track_events_marca_robo();

-- Marca os que já entraram (só a marcação; nada é apagado).
update public.track_events set is_bot = true
where not is_bot and source = 'capi' and event_name <> 'Purchase'
  and public.track_is_meta_ip(ip)
  and coalesce(user_agent, '') !~* 'FBAN|FBAV|FB_IAB|FBIOS|Instagram';
