-- Migration 041: corrige recursão na policy "admin sees all profiles"
--
-- A migration 040 recriou essa policy checando o role admin com uma
-- subconsulta direto em user_profiles — mas essa policy está NA PRÓPRIA
-- user_profiles, então o Postgres entra em recursão ao tentar avaliá-la
-- (pra saber se a linha é visível, precisa reavaliar a mesma policy).
-- Resultado: toda leitura de user_profiles passou a falhar, inclusive pro
-- dono da conta — por isso os projetos sumiram.
--
-- Correção padrão recomendada pelo Postgres/Supabase: mover a checagem de
-- admin para uma função SECURITY DEFINER, que roda sem aplicar RLS
-- internamente e por isso não recursiona.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

DROP POLICY IF EXISTS "admin sees all profiles" ON public.user_profiles;
CREATE POLICY "admin sees all profiles" ON public.user_profiles
  FOR ALL USING (public.is_admin());
