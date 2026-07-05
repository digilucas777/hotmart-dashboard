-- Migration 045: corrige avisos de segurança do Supabase (get_advisors)
--
-- Nenhuma dessas mudanças altera comportamento visível do app — só fecha
-- brechas apontadas pelo checador automático de segurança do Supabase.

-- 1. Corrige search_path das funções que não tinham (evita manipulação de
-- search_path por quem consegue rodar SQL na mesma sessão).
ALTER FUNCTION public.get_distinct_ofertas(text[]) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- 2. handle_new_user só deve rodar como gatilho automático em auth.users
-- (cria a linha em user_profiles quando alguém se cadastra) — nunca deveria
-- ser chamável direto pela API. Revoga a execução direta; o próprio gatilho
-- continua funcionando normalmente, pois não depende de permissão EXECUTE
-- de quem disparou o INSERT.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 3. notified_sale_events tinha RLS ligado mas nenhuma política — ou seja,
-- nem o admin conseguia ler pelo app (só o webhook, via chave de serviço,
-- que ignora RLS). Adiciona leitura pra admin, mesmo padrão já usado em
-- dashboard_access_log (042) e notification_preferences (043).
DROP POLICY IF EXISTS "admin sees all notified events" ON public.notified_sale_events;
CREATE POLICY "admin sees all notified events" ON public.notified_sale_events
  FOR SELECT USING (public.is_admin());

-- is_admin() não é alterada aqui: já tem search_path fixo desde que foi
-- criada (migration 041), e revogar sua execução direta quebraria as
-- políticas de RLS que dependem dela em várias tabelas.
