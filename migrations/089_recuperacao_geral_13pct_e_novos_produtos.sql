-- 1) Novos projetos de Recuperação por idioma (FR/IT), mesmo padrão do "[Es]RECUPERAÇÃO"
insert into projetos (id, nome, user_id, ordem, data_criacao)
values
  (gen_random_uuid(), '[Fr]RECUPERAÇÃO', 'd1309284-83f1-4d30-998a-19e280681465', 23, now()),
  (gen_random_uuid(), '[IT]RECUPERAÇÃO', 'd1309284-83f1-4d30-998a-19e280681465', 24, now());

-- 2) Produtos novos de recuperação (FR "BORDELES" + IT "PRODUTOS"), exceto os de assinatura
insert into produtos (id, hotmart_id, nome)
values
  (gen_random_uuid(), '8333593', 'Cours de massage tantrique®'),
  (gen_random_uuid(), '8746916', 'Mises à jour à vie®'),
  (gen_random_uuid(), '8333774', 'Oral inoubliable®'),
  (gen_random_uuid(), '8333796', 'Plaisir Interdit®'),
  (gen_random_uuid(), '8333741', 'LE SECRET DU SQUIRT®'),
  (gen_random_uuid(), '8333761', 'L''Art du Toucher Fatal®'),
  (gen_random_uuid(), '8735528', 'L''Arte del Massaggio Tantrico®'),
  (gen_random_uuid(), '8735564', 'Accesso a Vita®'),
  (gen_random_uuid(), '8742701', 'Il Segreto del Piacere Orale®'),
  (gen_random_uuid(), '8742711', 'Guida alla Confidenza Anale®'),
  (gen_random_uuid(), '8742722', 'IL SEGRETO DELLO SQUIRT®'),
  (gen_random_uuid(), '8742744', 'L''arte del Tocco Fatale®'),
  (gen_random_uuid(), '8742780', 'Joyce Privato - Video Settimanali®')
on conflict (hotmart_id) do nothing;

-- 3) Liga cada produto novo ao seu projeto de idioma E também ao Recuperação Geral (pedido explícito: "os dois")
insert into projeto_produtos (projeto_id, produto_id, todas_ofertas)
select proj.id, pr.id, true
from projetos proj, produtos pr
where proj.nome = '[Fr]RECUPERAÇÃO'
  and pr.hotmart_id in ('8333593','8746916','8333774','8333796','8333741','8333761')
on conflict (projeto_id, produto_id) do nothing;

insert into projeto_produtos (projeto_id, produto_id, todas_ofertas)
select proj.id, pr.id, true
from projetos proj, produtos pr
where proj.nome = '[IT]RECUPERAÇÃO'
  and pr.hotmart_id in ('8735528','8735564','8742701','8742711','8742722','8742744','8742780')
on conflict (projeto_id, produto_id) do nothing;

insert into projeto_produtos (projeto_id, produto_id, todas_ofertas)
select 'c646c137-700f-47ba-bfb7-929f0a894b2f', pr.id, true
from produtos pr
where pr.hotmart_id in (
  '8333593','8746916','8333774','8333796','8333741','8333761',
  '8735528','8735564','8742701','8742711','8742722','8742744','8742780'
)
on conflict (projeto_id, produto_id) do nothing;

-- 4) Widgets padrão pros 2 projetos novos (mesmo template do "[Es]RECUPERAÇÃO")
insert into dashboard_widgets (projeto_id, type, data_source, title, width, position, height, col_start, row_start, col_span, row_span)
select proj.id, w.type, w.data_source, w.title, w.width, w.position, w.height, w.col_start, w.row_start, w.col_span, w.row_span
from projetos proj, (
  select type, data_source, title, width, position, height, col_start, row_start, col_span, row_span
  from dashboard_widgets
  where projeto_id = '540ef591-1601-4e22-84fc-46053f6758d7'
) w
where proj.nome in ('[Fr]RECUPERAÇÃO', '[IT]RECUPERAÇÃO');
