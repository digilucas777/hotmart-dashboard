-- lead mostra quando a origem (UTM/fbc) foi recuperada de outra visita do mesmo aparelho
do $$
declare d text := pg_get_functiondef('public.track_leads'::regproc);
  a text := $a$         max(e.geo_city) cidade,$a$;
  b text := $b$coalesce(cm.lista, '[]'::jsonb) compras$b$;
begin
  if position(a in d) = 0 or position(b in d) = 0 then raise exception 'trecho nao encontrado'; end if;
  if position('recuperada' in d) > 0 then return; end if;
  d := replace(d, a, a || $n$
         bool_or(e.recuperada_de is not null) recuperada,$n$);
  d := replace(d, b, b || $n$,
         coalesce(d.recuperada, false) recuperada$n$);
  execute d;
end $$;
select position('recuperada' in pg_get_functiondef('public.track_leads'::regproc)) > 0 ok;
