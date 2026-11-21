-- Cada compra do lead traz horario, src e UTMs (cartoes expandidos na tabela de leads).
-- Aplicada em 21/11/2026 como patch da funcao existente.
do $$
declare d text := pg_get_functiondef('public.track_leads'::regproc);
  a text := $a$'enviada', enviada) order by t) lista$a$;
  c text := $c$           (e.source = 'capi' and coalesce(e.capi_send_ok, true)) as enviada
    from track_events e
    left join public.vendas v$c$;
begin
  if position(a in d) = 0 or position(c in d) = 0 then raise exception 'trecho nao encontrado'; end if;
  d := replace(d, a, $b$'enviada', enviada, 't', t, 'src', src, 'utm_source', utm_source, 'utm_campaign', utm_campaign, 'utm_medium', utm_medium, 'utm_content', utm_content, 'utm_term', utm_term) order by t) lista$b$);
  d := replace(d, c, $c2$           e.src, e.utm_source, e.utm_campaign, e.utm_medium, e.utm_content, e.utm_term,
           (e.source = 'capi' and coalesce(e.capi_send_ok, true)) as enviada
    from track_events e
    left join public.vendas v$c2$);
  execute d;
end $$;
