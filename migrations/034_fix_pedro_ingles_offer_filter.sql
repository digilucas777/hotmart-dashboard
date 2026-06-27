-- Fix: faturamento incorreto no dashboard TRÁFEGO[PEDRO] INGLES
-- Causa: produtos com todas_ofertas=false sem ofertas configuradas em
-- projeto_produto_ofertas fazem filterRowsByOfferSelection descartar todas
-- as vendas desses produtos silenciosamente.
-- Solução: reset todas_ofertas=true para todos os produtos desse projeto,
-- garantindo que todas as vendas passem pelo filtro (comportamento padrão).

UPDATE public.projeto_produtos
SET todas_ofertas = true
WHERE projeto_id = '1e173ac3-0754-4967-8294-81afefb7a045';

DELETE FROM public.projeto_produto_ofertas
WHERE projeto_id = '1e173ac3-0754-4967-8294-81afefb7a045';
