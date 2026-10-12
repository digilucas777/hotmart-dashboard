-- 12/10/2026: Lucas parou de rodar trafego pago em espanhol no dia 09/10/2026.
-- As vendas de App e Recuperacao desses mesmos 36 produtos (que seguem
-- vinculados ao "🟡 [Es] Lucas" com todas_ofertas=true) continuavam contando
-- no faturamento do trafego, mesmo sem ele estar rodando campanha nenhuma
-- (achado nesta conversa: 190 vendas, ~$4.148 em set+out/2026).
--
-- Pedido do usuario: em vez de apagar essas vendas, vincula-las aos projetos
-- certos — 📲APP-ESPANHOL (ja existe) e um novo projeto de recuperacao
-- espanhol (nao existia, criado aqui).
--
-- Mesma tecnica da migration 084 (oferta virtual por origem dentro do
-- resumo pre-calculado vendas_resumo_diario, sem tocar vendas.oferta_codigo
-- de verdade), generalizada pros 36 produtos do trafego espanhol com split
-- em 3 (trafego / app / recuperacao) em vez de 2, usando a mesma
-- classificacao de origem ja usada nos relatorios (rec%/upsell%/renov%/
-- %recusada% = recuperacao; 'app'/bannerapp%/HOTMART_SITE_APP = app).
--
-- Produtos de App-Espanhol e Recuperacao-Espanhol tem hotmart_id proprio e
-- diferente (ofertas "®" separadas na Hotmart) — isso aqui e so pras vendas
-- de App/Recuperacao que caem nos produtos "do trafego" (℗/✧/etc, sem
-- oferta de app dedicada), confirmado pelo usuario.

insert into projetos (nome, user_id, ordem)
select 'LUCAS-RECUPERAÇÃO-ESPANHOL', 'd1309284-83f1-4d30-998a-19e280681465', 19
where not exists (select 1 from projetos where nome = 'LUCAS-RECUPERAÇÃO-ESPANHOL');

create or replace function refresh_vendas_resumo_diario_by_hotmart_id(p_hotmart_id text)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_produto_id text;
  v_oferta_real text;
  v_origem text;
  v_oferta text;
  v_data date;
  v_trafego_es_ids constant text[] := array[
    '4804098','4804186','4804654','8294393','5085309','7311693','7359983','4802964','8291627','4803869',
    '4821899','8356204','6101329','7052581','563191','4804539','4804737','8356156','5669621','8291970',
    '7010960','4804439','8292135','7052625','8293571','7360080','8294223','4855438','5608576','8293904',
    '6101509','6101720','6264821','7312372','8356130','7222835'
  ];
begin
  select hotmart_produto_id, coalesce(oferta_codigo, ''), origem,
         (data_venda at time zone 'America/Sao_Paulo')::date
    into v_produto_id, v_oferta_real, v_origem, v_data
  from vendas
  where hotmart_id = p_hotmart_id;

  if v_produto_id is null or v_data is null then
    return;
  end if;

  v_oferta := case
    when v_produto_id = '7744143' and v_origem = 'app' then v_oferta_real || '__app'
    when v_produto_id = any(v_trafego_es_ids) then
      case
        when v_origem ilike 'rec%' or v_origem ilike 'upsell%' or v_origem ilike 'renov%' or v_origem ilike '%recusada%' then v_oferta_real || '__rec'
        when v_origem = 'app' or v_origem ilike 'bannerapp%' or v_origem ilike 'HOTMART_SITE_APP' then v_oferta_real || '__app'
        else v_oferta_real
      end
    else v_oferta_real
  end;

  perform pg_advisory_xact_lock(hashtextextended(v_produto_id || '|' || v_oferta || '|' || v_data::text, 0));

  delete from vendas_resumo_diario
  where hotmart_produto_id = v_produto_id
    and oferta_codigo = v_oferta
    and data = v_data;

  insert into vendas_resumo_diario (hotmart_produto_id, oferta_codigo, data, status, moeda, cnt, total)
  select
    hotmart_produto_id,
    case
      when hotmart_produto_id = '7744143' and origem = 'app' then coalesce(oferta_codigo, '') || '__app'
      when hotmart_produto_id = any(v_trafego_es_ids) then
        case
          when origem ilike 'rec%' or origem ilike 'upsell%' or origem ilike 'renov%' or origem ilike '%recusada%' then coalesce(oferta_codigo, '') || '__rec'
          when origem = 'app' or origem ilike 'bannerapp%' or origem ilike 'HOTMART_SITE_APP' then coalesce(oferta_codigo, '') || '__app'
          else coalesce(oferta_codigo, '')
        end
      else coalesce(oferta_codigo, '')
    end as oferta_bucket,
    (data_venda at time zone 'America/Sao_Paulo')::date, status, moeda,
    count(*), coalesce(sum(valor_operacional_final), 0)
  from vendas
  where hotmart_produto_id = v_produto_id
    and (data_venda at time zone 'America/Sao_Paulo')::date = v_data
    and (
      case
        when hotmart_produto_id = '7744143' and origem = 'app' then coalesce(oferta_codigo, '') || '__app'
        when hotmart_produto_id = any(v_trafego_es_ids) then
          case
            when origem ilike 'rec%' or origem ilike 'upsell%' or origem ilike 'renov%' or origem ilike '%recusada%' then coalesce(oferta_codigo, '') || '__rec'
            when origem = 'app' or origem ilike 'bannerapp%' or origem ilike 'HOTMART_SITE_APP' then coalesce(oferta_codigo, '') || '__app'
            else coalesce(oferta_codigo, '')
          end
        else coalesce(oferta_codigo, '')
      end
    ) = v_oferta
  group by 1, 2, 3, 4, 5;
end;
$$;

-- Reconstroi o resumo ja existente desses 36 produtos com a nova regra
-- (o resumo antigo foi gravado com oferta_codigo real pra tudo, sem split).
delete from vendas_resumo_diario
where hotmart_produto_id in (
  '4804098','4804186','4804654','8294393','5085309','7311693','7359983','4802964','8291627','4803869',
  '4821899','8356204','6101329','7052581','563191','4804539','4804737','8356156','5669621','8291970',
  '7010960','4804439','8292135','7052625','8293571','7360080','8294223','4855438','5608576','8293904',
  '6101509','6101720','6264821','7312372','8356130','7222835'
);

insert into vendas_resumo_diario (hotmart_produto_id, oferta_codigo, data, status, moeda, cnt, total)
select
  hotmart_produto_id,
  case
    when origem ilike 'rec%' or origem ilike 'upsell%' or origem ilike 'renov%' or origem ilike '%recusada%' then coalesce(oferta_codigo, '') || '__rec'
    when origem = 'app' or origem ilike 'bannerapp%' or origem ilike 'HOTMART_SITE_APP' then coalesce(oferta_codigo, '') || '__app'
    else coalesce(oferta_codigo, '')
  end,
  (data_venda at time zone 'America/Sao_Paulo')::date,
  status,
  moeda,
  count(*),
  coalesce(sum(valor_operacional_final), 0)
from vendas
where hotmart_produto_id in (
  '4804098','4804186','4804654','8294393','5085309','7311693','7359983','4802964','8291627','4803869',
  '4821899','8356204','6101329','7052581','563191','4804539','4804737','8356156','5669621','8291970',
  '7010960','4804439','8292135','7052625','8293571','7360080','8294223','4855438','5608576','8293904',
  '6101509','6101720','6264821','7312372','8356130','7222835'
)
  and data_venda is not null and status is not null and moeda is not null
group by 1, 2, 3, 4, 5;

-- Trafego ES passa a ter ofertas especificas por produto (em vez de
-- todas_ofertas=true), senao App/Recuperacao continuariam contando nele.
update projeto_produtos
set todas_ofertas = false
where projeto_id = '314861f2-63b1-48d6-b1ea-6208fd64176c'
  and produto_id in (
    select id from produtos where hotmart_id in (
      '4804098','4804186','4804654','8294393','5085309','7311693','7359983','4802964','8291627','4803869',
      '4821899','8356204','6101329','7052581','563191','4804539','4804737','8356156','5669621','8291970',
      '7010960','4804439','8292135','7052625','8293571','7360080','8294223','4855438','5608576','8293904',
      '6101509','6101720','6264821','7312372','8356130','7222835'
    )
  );

-- Trafego mantem as ofertas reais (sem sufixo) que ja existiam nas vendas.
insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select distinct '314861f2-63b1-48d6-b1ea-6208fd64176c', pr.id, coalesce(v.oferta_codigo, ''),
  case when coalesce(v.oferta_codigo, '') = '' then 'sem oferta (trafego)' else v.oferta_codigo || ' (trafego)' end
from vendas v
join produtos pr on pr.hotmart_id = v.hotmart_produto_id
where v.hotmart_produto_id in (
  '4804098','4804186','4804654','8294393','5085309','7311693','7359983','4802964','8291627','4803869',
  '4821899','8356204','6101329','7052581','563191','4804539','4804737','8356156','5669621','8291970',
  '7010960','4804439','8292135','7052625','8293571','7360080','8294223','4855438','5608576','8293904',
  '6101509','6101720','6264821','7312372','8356130','7222835'
)
on conflict do nothing;

-- App-Espanhol passa a receber as vendas de origem 'app' desses 36 produtos
-- (precisa do vinculo produto-projeto, que ainda nao existia pra eles).
insert into projeto_produtos (projeto_id, produto_id, todas_ofertas)
select distinct '80cd0167-d01d-44ac-99e2-4e7f3bd99075', pr.id, false
from produtos pr
where pr.hotmart_id in (
  '4804098','4804186','4804654','8294393','5085309','7311693','7359983','4802964','8291627','4803869',
  '4821899','8356204','6101329','7052581','563191','4804539','4804737','8356156','5669621','8291970',
  '7010960','4804439','8292135','7052625','8293571','7360080','8294223','4855438','5608576','8293904',
  '6101509','6101720','6264821','7312372','8356130','7222835'
)
on conflict do nothing;

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select distinct '80cd0167-d01d-44ac-99e2-4e7f3bd99075', pr.id, coalesce(v.oferta_codigo, '') || '__app',
  case when coalesce(v.oferta_codigo, '') = '' then 'sem oferta (app)' else v.oferta_codigo || ' (app)' end
from vendas v
join produtos pr on pr.hotmart_id = v.hotmart_produto_id
where v.hotmart_produto_id in (
  '4804098','4804186','4804654','8294393','5085309','7311693','7359983','4802964','8291627','4803869',
  '4821899','8356204','6101329','7052581','563191','4804539','4804737','8356156','5669621','8291970',
  '7010960','4804439','8292135','7052625','8293571','7360080','8294223','4855438','5608576','8293904',
  '6101509','6101720','6264821','7312372','8356130','7222835'
)
on conflict do nothing;

-- LUCAS-RECUPERAÇÃO-ESPANHOL (novo) recebe as vendas de recuperacao desses
-- 36 produtos.
insert into projeto_produtos (projeto_id, produto_id, todas_ofertas)
select distinct (select id from projetos where nome = 'LUCAS-RECUPERAÇÃO-ESPANHOL'), pr.id, false
from produtos pr
where pr.hotmart_id in (
  '4804098','4804186','4804654','8294393','5085309','7311693','7359983','4802964','8291627','4803869',
  '4821899','8356204','6101329','7052581','563191','4804539','4804737','8356156','5669621','8291970',
  '7010960','4804439','8292135','7052625','8293571','7360080','8294223','4855438','5608576','8293904',
  '6101509','6101720','6264821','7312372','8356130','7222835'
)
on conflict do nothing;

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select distinct (select id from projetos where nome = 'LUCAS-RECUPERAÇÃO-ESPANHOL'), pr.id, coalesce(v.oferta_codigo, '') || '__rec',
  case when coalesce(v.oferta_codigo, '') = '' then 'sem oferta (recuperacao)' else v.oferta_codigo || ' (recuperacao)' end
from vendas v
join produtos pr on pr.hotmart_id = v.hotmart_produto_id
where v.hotmart_produto_id in (
  '4804098','4804186','4804654','8294393','5085309','7311693','7359983','4802964','8291627','4803869',
  '4821899','8356204','6101329','7052581','563191','4804539','4804737','8356156','5669621','8291970',
  '7010960','4804439','8292135','7052625','8293571','7360080','8294223','4855438','5608576','8293904',
  '6101509','6101720','6264821','7312372','8356130','7222835'
)
on conflict do nothing;
