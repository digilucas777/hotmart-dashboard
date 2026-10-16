-- 16/10/2026: Lucas vai parar de rodar tráfego pago nos próprios produtos (o chefe
-- assume) e vai criar um produto de assinatura novo pro chefe. Ele continua recebendo
-- 33% de comissão sobre as assinaturas recorrentes (recurring) dos produtos "Joyce"
-- que já vende em ES/FR/IT — pediu um gráfico combinado separado só com essas
-- assinaturas, sem gasto de anúncio (ele não paga tráfego por essas recorrências).
--
-- Produtos/ofertas com plano de assinatura (vendas.plano_nome não nulo) já
-- identificados nos projetos de Lucas:
--   ES: 7360080 (ofertas cd0hu09o "4,99 LUCAS" / 118g8x3h "Videos Semanales"),
--       8293571 (oferta lryyoask "Mensal")
--   FR: 7468175 (ofertas ta0d334r "7,98 euros 1 mes gratis" / nli6e0tq "SEM TESTE" /
--       vx3jh34j "Videos Semanais")
--   IT: 7313804 (oferta zwctuy7j "2,99"), 8275411 (ofertas 3cwnl2dk "principaç" /
--       bfjky92i "SEM TESTE")
--
-- Esses mesmos produtos/ofertas continuam contando normalmente nos projetos de
-- tráfego/app/recuperação de Lucas (essa migração só ADICIONA um vínculo a mais
-- pra um projeto novo "Assinatura" por idioma — não tira nada de lugar nenhum,
-- mesmo princípio aditivo das migrations 084/086).

insert into projetos (nome, user_id, ordem)
select v.nome, 'd1309284-83f1-4d30-998a-19e280681465', v.ordem
from (values
  ('[ES] Assinatura', 20),
  ('[FR] Assinatura', 21),
  ('[IT] Assinatura', 22)
) as v(nome, ordem)
where not exists (select 1 from projetos p where p.nome = v.nome);

-- ES: produtos 7360080 e 8293571
insert into projeto_produtos (projeto_id, produto_id, todas_ofertas)
select (select id from projetos where nome = '[ES] Assinatura'), produto_id, false
from (values
  ('e3fb1a3e-be32-4e0e-8844-44ca44944f26'::uuid),
  ('461e55da-91b5-4174-9a92-8f44b30438c7'::uuid)
) as v(produto_id)
on conflict do nothing;

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select (select id from projetos where nome = '[ES] Assinatura'), produto_id, oferta_codigo, oferta_nome
from (values
  ('e3fb1a3e-be32-4e0e-8844-44ca44944f26'::uuid, 'cd0hu09o', '4,99 LUCAS (assinatura)'),
  ('e3fb1a3e-be32-4e0e-8844-44ca44944f26'::uuid, '118g8x3h', 'Videos Semanales (assinatura)'),
  ('461e55da-91b5-4174-9a92-8f44b30438c7'::uuid, 'lryyoask', 'Mensal (assinatura)')
) as v(produto_id, oferta_codigo, oferta_nome)
on conflict do nothing;

-- FR: produto 7468175
insert into projeto_produtos (projeto_id, produto_id, todas_ofertas)
select (select id from projetos where nome = '[FR] Assinatura'), '5cf1cd9d-c2ee-4028-b038-679e25ee3e92'::uuid, false
on conflict do nothing;

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select (select id from projetos where nome = '[FR] Assinatura'), '5cf1cd9d-c2ee-4028-b038-679e25ee3e92'::uuid, oferta_codigo, oferta_nome
from (values
  ('ta0d334r', '7,98 euros 1 mes gratis (assinatura)'),
  ('nli6e0tq', 'SEM TESTE (assinatura)'),
  ('vx3jh34j', 'Videos Semanais (assinatura)')
) as v(oferta_codigo, oferta_nome)
on conflict do nothing;

-- IT: produtos 7313804 e 8275411
insert into projeto_produtos (projeto_id, produto_id, todas_ofertas)
select (select id from projetos where nome = '[IT] Assinatura'), produto_id, false
from (values
  ('798dcc04-276e-44e7-a59d-82703632ed3c'::uuid),
  ('7d073492-4205-4472-8d31-3ab20b5080c8'::uuid)
) as v(produto_id)
on conflict do nothing;

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select (select id from projetos where nome = '[IT] Assinatura'), produto_id, oferta_codigo, oferta_nome
from (values
  ('798dcc04-276e-44e7-a59d-82703632ed3c'::uuid, 'zwctuy7j', '2,99 (assinatura)'),
  ('7d073492-4205-4472-8d31-3ab20b5080c8'::uuid, '3cwnl2dk', 'principaç (assinatura)'),
  ('7d073492-4205-4472-8d31-3ab20b5080c8'::uuid, 'bfjky92i', 'SEM TESTE (assinatura)')
) as v(produto_id, oferta_codigo, oferta_nome)
on conflict do nothing;

-- Combinado "Assinaturas Recorrentes (33%)" juntando os 3 projetos novos.
insert into dashboard_combos (user_id, nome, projeto_ids, ordem)
select 'd1309284-83f1-4d30-998a-19e280681465',
  'Assinaturas Recorrentes (33%)',
  array[
    (select id from projetos where nome = '[ES] Assinatura'),
    (select id from projetos where nome = '[FR] Assinatura'),
    (select id from projetos where nome = '[IT] Assinatura')
  ],
  (select coalesce(max(ordem), 0) + 1 from dashboard_combos where user_id = 'd1309284-83f1-4d30-998a-19e280681465')
where not exists (select 1 from dashboard_combos where nome = 'Assinaturas Recorrentes (33%)' and user_id = 'd1309284-83f1-4d30-998a-19e280681465');

-- Widgets padrão nos 3 projetos novos (mesmo layout usado em outros projetos),
-- pra não ficarem com a dashboard individual vazia se Lucas clicar neles direto.
insert into dashboard_widgets (projeto_id, type, data_source, title, width, position, height, col_start, row_start, col_span, row_span)
select p.id, w.type, w.data_source, w.title, w.width, w.position, w.height, w.col_start, w.row_start, w.col_span, w.row_span
from projetos p
cross join (
  select type, data_source, title, width, position, height, col_start, row_start, col_span, row_span
  from dashboard_widgets where projeto_id = '80cd0167-d01d-44ac-99e2-4e7f3bd99075'
) w
where p.nome in ('[ES] Assinatura', '[FR] Assinatura', '[IT] Assinatura')
  and not exists (select 1 from dashboard_widgets dw where dw.projeto_id = p.id);
