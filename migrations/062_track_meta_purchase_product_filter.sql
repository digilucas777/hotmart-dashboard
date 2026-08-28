-- Migration 062: filtra quais produtos da Hotmart mandam Purchase pra Meta
--
-- Um funil costuma ter produto principal + order bumps/upsells na Hotmart —
-- cada um com seu próprio product.id, mas todos passando pelo mesmo checkout/
-- webhook. Sem esse filtro, comprar o funil inteiro virava vários Purchase
-- separados na Meta (um por produto), inflando/distorcendo a otimização de
-- campanha (pedido real do usuário: só o produto principal deve gerar
-- Purchase pro Meta).
--
-- Aditivo apenas: lista vazia/null = manda Purchase de qualquer produto
-- (comportamento anterior, continua valendo pra quem não configurou nada).

ALTER TABLE public.track_installations
  ADD COLUMN IF NOT EXISTS meta_purchase_product_ids text[] NOT NULL DEFAULT '{}';
