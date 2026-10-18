-- Os produtos de recuperação do espanhol ("[Es]RECUPERAÇÃO") nunca tinham sido linkados
-- ao "⭐RECUPERAÇÃO GERAL [BR E US]" (só os produtos novos de FR/IT, cadastrados na
-- migration 089, já tinham recebido esse double-link). Lucas confirmou em 18/10/2026 que
-- as vendas de recuperação ES também devem contar no Recuperação Geral — mesma lógica
-- "os dois" já aplicada pra FR/IT.

insert into projeto_produtos (projeto_id, produto_id, todas_ofertas)
select 'c646c137-700f-47ba-bfb7-929f0a894b2f', pp.produto_id, pp.todas_ofertas
from projeto_produtos pp
where pp.projeto_id = '540ef591-1601-4e22-84fc-46053f6758d7' -- [Es]RECUPERAÇÃO
on conflict (projeto_id, produto_id) do nothing;

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select 'c646c137-700f-47ba-bfb7-929f0a894b2f', ppo.produto_id, ppo.oferta_codigo, ppo.oferta_nome
from projeto_produto_ofertas ppo
where ppo.projeto_id = '540ef591-1601-4e22-84fc-46053f6758d7'
on conflict (projeto_id, produto_id, oferta_codigo) do nothing;
