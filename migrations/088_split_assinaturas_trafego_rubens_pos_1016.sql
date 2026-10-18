-- Remove vendas de assinatura (Joyce semanal/mensal) do tráfego ES/FR/IT a partir de 2026-10-16
-- (dia em que o Rubens assumiu o tráfego de Lucas), mantendo o histórico até 2026-10-15 intacto
-- e sem afetar o combinado de comissão de assinaturas (33%), que continua contando tudo.
--
-- Produtos afetados:
--   7468175 (FR Joyce Privé), 8293571 (ES Joyce Gumiero), 7360080 (ES Joyce Privado),
--   8275411 (IT Joyce Private), 7313804 (IT Joyce Privato)
--
-- Técnica: mesmo padrão de "oferta virtual" das migrations 084/086, mas o corte agora é por
-- data (>= 2026-10-16) em vez de por origem. O bucket em vendas_resumo_diario ganha o sufixo
-- "__pos1016" quando a venda é de 16/10/2026 em diante; o tráfego ES/FR/IT deixa de enxergar
-- esse bucket (projeto_produto_ofertas não o lista), e o combinado de Assinatura passa a
-- listar também o bucket sufixado, então continua contando normalmente.

begin;

-- 1) Atualiza a função de recomputo para aplicar o corte de data nos 5 produtos de assinatura
create or replace function public.refresh_vendas_resumo_diario_by_hotmart_id(p_hotmart_id text)
returns void
language plpgsql
set search_path to 'public'
as $function$
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
  v_assinatura_pos_ids constant text[] := array['7468175','8293571','7360080','8275411','7313804'];
  v_pos_cutoff constant date := '2026-10-16';
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
        when v_produto_id = any(v_assinatura_pos_ids) and v_data >= v_pos_cutoff then v_oferta_real || '__pos1016'
        else v_oferta_real
      end
    when v_produto_id = any(v_assinatura_pos_ids) and v_data >= v_pos_cutoff then v_oferta_real || '__pos1016'
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
          when hotmart_produto_id = any(v_assinatura_pos_ids) and (data_venda at time zone 'America/Sao_Paulo')::date >= v_pos_cutoff then coalesce(oferta_codigo, '') || '__pos1016'
          else coalesce(oferta_codigo, '')
        end
      when hotmart_produto_id = any(v_assinatura_pos_ids) and (data_venda at time zone 'America/Sao_Paulo')::date >= v_pos_cutoff then coalesce(oferta_codigo, '') || '__pos1016'
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
            when hotmart_produto_id = any(v_assinatura_pos_ids) and (data_venda at time zone 'America/Sao_Paulo')::date >= v_pos_cutoff then coalesce(oferta_codigo, '') || '__pos1016'
            else coalesce(oferta_codigo, '')
          end
        when hotmart_produto_id = any(v_assinatura_pos_ids) and (data_venda at time zone 'America/Sao_Paulo')::date >= v_pos_cutoff then coalesce(oferta_codigo, '') || '__pos1016'
        else coalesce(oferta_codigo, '')
      end
    ) = v_oferta
  group by 1, 2, 3, 4, 5;
end;
$function$;

-- 2) Backfill: recompõe vendas_resumo_diario dos 5 produtos para datas >= 2026-10-16
delete from vendas_resumo_diario
where hotmart_produto_id in ('7468175','8293571','7360080','8275411','7313804')
  and data >= '2026-10-16';

insert into vendas_resumo_diario (hotmart_produto_id, oferta_codigo, data, status, moeda, cnt, total)
select
  hotmart_produto_id,
  case
    when origem ilike 'rec%' or origem ilike 'upsell%' or origem ilike 'renov%' or origem ilike '%recusada%' then coalesce(oferta_codigo, '') || '__rec'
    when origem = 'app' or origem ilike 'bannerapp%' or origem ilike 'HOTMART_SITE_APP' then coalesce(oferta_codigo, '') || '__app'
    else coalesce(oferta_codigo, '') || '__pos1016'
  end as oferta_bucket,
  (data_venda at time zone 'America/Sao_Paulo')::date,
  status, moeda,
  count(*), coalesce(sum(valor_operacional_final), 0)
from vendas
where hotmart_produto_id in ('7468175','8293571','7360080','8275411','7313804')
  and (data_venda at time zone 'America/Sao_Paulo')::date >= '2026-10-16'
group by 1, 2, 3, 4, 5;

-- 3) FR/IT Lucas: hoje enxergam todas as ofertas desses produtos (todas_ofertas=true);
--    passam a enxergar só as ofertas reais (pré-corte), igual já funciona para o ES.
update projeto_produtos
set todas_ofertas = false
where projeto_id in (
    '871892b4-5bb4-49a4-a083-64f1a2d1bd56', -- FR Lucas
    '19efac1e-77b7-4029-9ff3-9d1a26e6e11e'  -- IT Lucas
  )
  and produto_id in (
    select id from produtos where hotmart_id in ('7468175','8275411','7313804')
  );

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select '871892b4-5bb4-49a4-a083-64f1a2d1bd56', id, codigo, nome
from produtos, (values
  ('nli6e0tq', 'nli6e0tq (trafego)'),
  ('ta0d334r', 'ta0d334r (trafego)'),
  ('vx3jh34j', 'vx3jh34j (trafego)'),
  ('', 'sem oferta (trafego)')
) as t(codigo, nome)
where hotmart_id = '7468175'
on conflict (projeto_id, produto_id, oferta_codigo) do nothing;

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select '19efac1e-77b7-4029-9ff3-9d1a26e6e11e', id, codigo, nome
from produtos, (values
  ('3cwnl2dk', '3cwnl2dk (trafego)'),
  ('bfjky92i', 'bfjky92i (trafego)'),
  ('', 'sem oferta (trafego)')
) as t(codigo, nome)
where hotmart_id = '8275411'
on conflict (projeto_id, produto_id, oferta_codigo) do nothing;

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select '19efac1e-77b7-4029-9ff3-9d1a26e6e11e', id, 'zwctuy7j', 'zwctuy7j (trafego)'
from produtos where hotmart_id = '7313804'
on conflict (projeto_id, produto_id, oferta_codigo) do nothing;

-- 4) Combinados de Assinatura (ES/FR/IT): passam a listar também o bucket "__pos1016",
--    pra continuar contando a comissão de 33% sem corte de data.
insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select 'dbc7707d-a204-4bb2-8b3b-7bcceb001225', id, codigo, nome
from produtos, (values
  ('nli6e0tq__pos1016', 'SEM TESTE (assinatura, pós 16/10)'),
  ('ta0d334r__pos1016', '7,98 euros 1 mes gratis (assinatura, pós 16/10)'),
  ('vx3jh34j__pos1016', 'Videos Semanais (assinatura, pós 16/10)'),
  ('__pos1016', 'sem oferta (assinatura, pós 16/10)')
) as t(codigo, nome)
where hotmart_id = '7468175'
on conflict (projeto_id, produto_id, oferta_codigo) do nothing;

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select '5745a63e-7af0-4d13-a59e-8cd1bb474b07', id, codigo, nome
from produtos, (values
  ('118g8x3h__pos1016', 'Videos Semanales (assinatura, pós 16/10)'),
  ('cd0hu09o__pos1016', '4,99 LUCAS (assinatura, pós 16/10)')
) as t(codigo, nome)
where hotmart_id = '7360080'
on conflict (projeto_id, produto_id, oferta_codigo) do nothing;

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select '5745a63e-7af0-4d13-a59e-8cd1bb474b07', id, 'lryyoask__pos1016', 'Mensal (assinatura, pós 16/10)'
from produtos where hotmart_id = '8293571'
on conflict (projeto_id, produto_id, oferta_codigo) do nothing;

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select 'f73494f3-a632-4dde-8d19-57aef231bae4', id, codigo, nome
from produtos, (values
  ('3cwnl2dk__pos1016', 'principaç (assinatura, pós 16/10)'),
  ('bfjky92i__pos1016', 'SEM TESTE (assinatura, pós 16/10)'),
  ('__pos1016', 'sem oferta (assinatura, pós 16/10)')
) as t(codigo, nome)
where hotmart_id = '8275411'
on conflict (projeto_id, produto_id, oferta_codigo) do nothing;

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select 'f73494f3-a632-4dde-8d19-57aef231bae4', id, 'zwctuy7j__pos1016', '2,99 (assinatura, pós 16/10)'
from produtos where hotmart_id = '7313804'
on conflict (projeto_id, produto_id, oferta_codigo) do nothing;

commit;
