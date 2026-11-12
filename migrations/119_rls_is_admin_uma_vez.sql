-- Desempenho do RLS: is_admin() chamado direto na política roda uma vez POR LINHA
-- (é security definer, o Postgres não consegue "inlinar"). Em 30 mil vendas eram
-- 30 mil consultas em user_profiles. Embrulhado em (select is_admin()) vira um
-- InitPlan: roda UMA vez por busca e o resultado vale pra todas as linhas.
-- A regra de quem vê o quê não muda nada (mesma função, mesma lógica).
-- Recomendação oficial do Supabase: "wrap functions in select" nas políticas RLS.
set lock_timeout = '5s';
do $$
declare
  p record;
  novo_qual text;
  novo_check text;
  sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ 'is_admin\(\)' or coalesce(with_check, '') ~ 'is_admin\(\)')
  loop
    -- troca só as chamadas soltas (não mexe nas que já estão em SELECT)
    novo_qual  := regexp_replace(p.qual,       '(?<!SELECT )(?<!select )is_admin\(\)', '(select is_admin())', 'g');
    novo_check := regexp_replace(p.with_check, '(?<!SELECT )(?<!select )is_admin\(\)', '(select is_admin())', 'g');
    if novo_qual is not distinct from p.qual and novo_check is not distinct from p.with_check then
      continue;
    end if;
    sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if p.qual is not null then sql := sql || format(' using (%s)', novo_qual); end if;
    if p.with_check is not null then sql := sql || format(' with check (%s)', novo_check); end if;
    execute sql;
  end loop;
end $$;
