-- Migration 046: permite ver produtos ainda não vinculados a nenhum projeto
--
-- A migration 039 removeu a policy antiga "authenticated users manage produtos"
-- (perigosa: liberava SELECT/INSERT/UPDATE/DELETE pra QUALQUER usuário
-- autenticado, sem checagem nenhuma). Só que essa policy também era, sem
-- ninguém perceber, a única forma de um produto novo (recém-criado pelo
-- webhook quando chega a primeira venda) aparecer na tela "Configurar
-- Produtos" antes de ser vinculado a um projeto.
--
-- A policy restritiva "users see own produtos" (migration 033) só libera
-- produtos que JÁ estão em projeto_produtos — ou seja, depois da 039, criou-se
-- um círculo: não dá pra vincular um produto que não dá pra ver. Todo produto
-- novo (de qualquer conta Hotmart) passou a sumir da lista de "Configurar
-- Produtos" até alguém inserir o vínculo manualmente via service role.
--
-- Efeito desta migration: qualquer usuário autenticado passa a enxergar
-- produtos que ainda não estão vinculados a NENHUM projeto (apenas id,
-- hotmart_id e nome — dados já públicos na página de venda da Hotmart).
-- Produtos já vinculados a projetos de outros usuários continuam invisíveis,
-- protegidos pela policy "users see own produtos".

CREATE POLICY "authenticated users see unlinked produtos"
  ON public.produtos FOR SELECT
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.projeto_produtos pp
      WHERE pp.produto_id = produtos.id
    )
  );
