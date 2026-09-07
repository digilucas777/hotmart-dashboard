-- Corrige 24 policies de RLS que chamavam auth.uid() direto (reavaliado
-- LINHA POR LINHA pelo Postgres) em vez de (select auth.uid()) (calculado
-- 1x por consulta, via initplan). Em tabelas grandes e que crescem todo dia
-- (vendas, track_events) isso vira um custo real por-linha em toda consulta
-- do dashboard — quanto mais dados acumulam, mais lento fica.
--
-- Mesma regra de acesso em todas: só reescreve a expressão booleana, não
-- muda quem pode ver/editar o quê. Confirmado pelo advisor de performance
-- do Supabase (lint auth_rls_initplan) em 2026-09-07.

alter policy "users_own_config" on public.configuracoes
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter policy "users manage own meta connections" on public.meta_connections
  using ((select auth.uid()) = user_id);

alter policy "users manage own meta project accounts" on public.meta_project_accounts
  using ((select auth.uid()) = user_id);

alter policy "users see own profile" on public.user_profiles
  using ((select auth.uid()) = id);

alter policy "users manage own projeto_custos" on public.projeto_custos
  using (exists (
    select 1 from projetos
    where projetos.id = projeto_custos.projeto_id and projetos.user_id = (select auth.uid())
  ));

alter policy "admin vê tudo" on public.user_dashboard_permissions
  using (exists (
    select 1 from user_profiles
    where user_profiles.id = (select auth.uid()) and user_profiles.role = 'admin'::text
  ));

alter policy "user vê as próprias" on public.user_dashboard_permissions
  using (user_id = (select auth.uid()));

alter policy "user acessa as próprias" on public.meta_project_connections
  using (exists (
    select 1 from meta_connections
    where meta_connections.id = meta_project_connections.meta_connection_id
      and meta_connections.user_id = (select auth.uid())
  ));

alter policy "user acessa os próprios" on public.custos_manuais
  using (exists (
    select 1 from projetos
    where projetos.id = custos_manuais.projeto_id and projetos.user_id = (select auth.uid())
  ));

alter policy "users manage own projetos" on public.projetos
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "users manage own projeto_produtos" on public.projeto_produtos
  using (exists (
    select 1 from projetos
    where projetos.id = projeto_produtos.projeto_id and projetos.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from projetos
    where projetos.id = projeto_produtos.projeto_id and projetos.user_id = (select auth.uid())
  ));

alter policy "users see own produtos" on public.produtos
  using (exists (
    select 1 from projeto_produtos pp join projetos pr on pr.id = pp.projeto_id
    where pp.produto_id = produtos.id and pr.user_id = (select auth.uid())
  ));

alter policy "users see own vendas" on public.vendas
  using (exists (
    select 1 from produtos p
      join projeto_produtos pp on pp.produto_id = p.id
      join projetos pr on pr.id = pp.projeto_id
    where p.hotmart_id = vendas.hotmart_produto_id and pr.user_id = (select auth.uid())
  ));

alter policy "users update own vendas" on public.vendas
  using (exists (
    select 1 from produtos p
      join projeto_produtos pp on pp.produto_id = p.id
      join projetos pr on pr.id = pp.projeto_id
    where p.hotmart_id = vendas.hotmart_produto_id and pr.user_id = (select auth.uid())
  ));

alter policy "users manage own projeto_produto_ofertas" on public.projeto_produto_ofertas
  using (exists (
    select 1 from projetos
    where projetos.id = projeto_produto_ofertas.projeto_id and projetos.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from projetos
    where projetos.id = projeto_produto_ofertas.projeto_id and projetos.user_id = (select auth.uid())
  ));

alter policy "users manage own dashboard_widgets" on public.dashboard_widgets
  using (exists (
    select 1 from projetos
    where projetos.id = dashboard_widgets.projeto_id and projetos.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from projetos
    where projetos.id = dashboard_widgets.projeto_id and projetos.user_id = (select auth.uid())
  ));

alter policy "dono ve e gerencia suas paginas" on public.monitored_pages
  using (exists (
    select 1 from monitored_sites s
    where s.id = monitored_pages.site_id and s.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from monitored_sites s
    where s.id = monitored_pages.site_id and s.user_id = (select auth.uid())
  ));

alter policy "dono ve e gerencia seus sites" on public.monitored_sites
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "dono ve e gerencia suas pastas" on public.monitored_page_folders
  using (exists (
    select 1 from monitored_sites s
    where s.id = monitored_page_folders.site_id and s.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from monitored_sites s
    where s.id = monitored_page_folders.site_id and s.user_id = (select auth.uid())
  ));

alter policy "users manage own track_installations" on public.track_installations
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "users manage own track_pixels" on public.track_pixels
  using (exists (
    select 1 from track_installations i
    where i.id = track_pixels.installation_id and i.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from track_installations i
    where i.id = track_pixels.installation_id and i.user_id = (select auth.uid())
  ));

alter policy "users manage own track_domains" on public.track_domains
  using (exists (
    select 1 from track_installations i
    where i.id = track_domains.installation_id and i.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from track_installations i
    where i.id = track_domains.installation_id and i.user_id = (select auth.uid())
  ));

alter policy "users manage own track_triggers" on public.track_triggers
  using (exists (
    select 1 from track_installations i
    where i.id = track_triggers.installation_id and i.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from track_installations i
    where i.id = track_triggers.installation_id and i.user_id = (select auth.uid())
  ));

alter policy "users see own track_events" on public.track_events
  using (exists (
    select 1 from track_installations i
    where i.id = track_events.installation_id and i.user_id = (select auth.uid())
  ));
