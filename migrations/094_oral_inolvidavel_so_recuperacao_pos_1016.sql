-- Lucas pediu pra tirar o produto 4855438 ("Oral inolvidable - ¡Hazla Delirar! ℗") do
-- tráfego ES também, a partir de 16/10/2026 (mesma regra dos 9 produtos Bordeless da
-- migration 090) — mesmo vendas sem origem registrada (origem null) contam como
-- recuperação a partir dessa data, não mais tráfego.

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
  v_bordeless_full_rec_ids constant text[] := array['8294393','8291627','8356204','8356156','8291970','8292135','8294223','8293904','8356130','4855438'];
  v_bordeless_cutoff constant date := '2026-10-16';
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
    when v_produto_id = any(v_bordeless_full_rec_ids) and v_data >= v_bordeless_cutoff then v_oferta_real || '__rec'
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
      when hotmart_produto_id = any(v_bordeless_full_rec_ids) and (data_venda at time zone 'America/Sao_Paulo')::date >= v_bordeless_cutoff then coalesce(oferta_codigo, '') || '__rec'
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
        when hotmart_produto_id = any(v_bordeless_full_rec_ids) and (data_venda at time zone 'America/Sao_Paulo')::date >= v_bordeless_cutoff then coalesce(oferta_codigo, '') || '__rec'
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

-- Backfill: recompõe vendas_resumo_diario do produto 4855438 para datas >= 2026-10-16
delete from vendas_resumo_diario
where hotmart_produto_id = '4855438'
  and data >= '2026-10-16';

insert into vendas_resumo_diario (hotmart_produto_id, oferta_codigo, data, status, moeda, cnt, total)
select
  hotmart_produto_id,
  coalesce(oferta_codigo, '') || '__rec' as oferta_bucket,
  (data_venda at time zone 'America/Sao_Paulo')::date,
  status, moeda,
  count(*), coalesce(sum(valor_operacional_final), 0)
from vendas
where hotmart_produto_id = '4855438'
  and (data_venda at time zone 'America/Sao_Paulo')::date >= '2026-10-16'
group by 1, 2, 3, 4, 5;
