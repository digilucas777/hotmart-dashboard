-- Migration 039: remove policies que liberavam vendas/produtos pra QUALQUER
-- usuário autenticado (ALL = ler, inserir, editar e apagar), sem nenhuma
-- checagem de projeto ou de dono. Não vieram de nenhuma migration anterior —
-- foram criadas direto no painel do Supabase, antes deste projeto de acesso
-- restrito começar, e nunca tinham sido notadas.
--
-- Efeito: a partir de agora, o acesso a vendas/produtos passa a respeitar
-- de verdade as políticas já existentes (dono do projeto, ou usuário
-- compartilhado com pode_visualizar + data de corte).
--
-- Rollback (não recomendado — eram as políticas inseguras):
--   CREATE POLICY "authenticated users manage vendas" ON public.vendas
--     FOR ALL USING (auth.role() = 'authenticated');
--   CREATE POLICY "authenticated users manage produtos" ON public.produtos
--     FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated users manage vendas" ON public.vendas;
DROP POLICY IF EXISTS "authenticated users manage produtos" ON public.produtos;
