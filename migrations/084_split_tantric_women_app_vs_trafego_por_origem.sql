-- Achado em 07/10/2026: "Tantric Massage Course for Women ℗"
-- (hotmart_produto_id 7744143) está vinculado com todas_ofertas=true tanto
-- em ℗TRÁFEGO-[PEDRO] quanto em 📲APP-INGLES. Diferente dos outros produtos
-- compartilhados (que tinham uma oferta "OFERTA ALUNOS APP" separada na
-- Hotmart pra filtrar), esse produto só tem UMA oferta de verdade
-- (uuia1eai) — então estava contando a MESMA venda duas vezes, inflando o
-- faturamento do App de forma errada.
--
-- Único sinal confiável pra separar: vendas.origem = 'app' (27 vendas,
-- $607,77) vs 'botao-vturb' (100 vendas, $2.245,88) vs vazio/sem rastreio
-- (54 vendas, $1.325,04) — as sem rastreio ficam no Tráfego junto com as de
-- botão, por ser o "dono padrão" quando não dá pra saber a origem.
--
-- Como vendas_resumo_diario é agrupado por produto+oferta+dia (não tem
-- coluna de origem), a solução aditiva e de baixo risco é: só PRA ESSE
-- PRODUTO, o resumo pré-calculado passa a guardar uma "oferta virtual"
-- (oferta_codigo || '__app') pras vendas com origem='app', mantendo o
-- oferta_codigo real pras demais. Isso NUNCA toca a coluna `vendas.oferta_codigo`
-- de verdade (dado bruto/auditável continua intacto) — é só como o resumo
-- pré-calculado agrupa esse produto específico. As 3 funções de leitura
-- (get_vendas_summary_v2/multi_v2/get_vendas_por_dia) e o mecanismo de
-- projeto_produto_ofertas continuam exatamente iguais, sem nenhuma mudança
-- — só passam a existir 2 "ofertas" nesse resumo pra esse produto, e cada
-- projeto aponta pra uma.

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
begin
  select hotmart_produto_id, coalesce(oferta_codigo, ''), origem, data_venda::date
    into v_produto_id, v_oferta_real, v_origem, v_data
  from vendas
  where hotmart_id = p_hotmart_id;

  if v_produto_id is null or v_data is null then
    return;
  end if;

  v_oferta := case
    when v_produto_id = '7744143' and v_origem = 'app' then v_oferta_real || '__app'
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
      else coalesce(oferta_codigo, '')
    end as oferta_bucket,
    data_venda::date, status, moeda,
    count(*), coalesce(sum(valor_operacional_final), 0)
  from vendas
  where hotmart_produto_id = v_produto_id
    and data_venda::date = v_data
    and (
      case
        when hotmart_produto_id = '7744143' and origem = 'app' then coalesce(oferta_codigo, '') || '__app'
        else coalesce(oferta_codigo, '')
      end
    ) = v_oferta
  group by 1, 2, 3, 4, 5;
end;
$$;

-- Reconstrói o resumo já existente desse produto com a nova regra (o
-- resumo antigo foi gravado com oferta_codigo real pra tudo, sem split).
delete from vendas_resumo_diario where hotmart_produto_id = '7744143';

insert into vendas_resumo_diario (hotmart_produto_id, oferta_codigo, data, status, moeda, cnt, total)
select
  hotmart_produto_id,
  case when origem = 'app' then coalesce(oferta_codigo, '') || '__app' else coalesce(oferta_codigo, '') end,
  data_venda::date,
  status,
  moeda,
  count(*),
  coalesce(sum(valor_operacional_final), 0)
from vendas
where hotmart_produto_id = '7744143'
  and data_venda is not null and status is not null and moeda is not null
group by 1, 2, 3, 4, 5;

-- Cada projeto passa a ter uma oferta exclusiva pra esse produto, em vez de
-- todas_ofertas=true pros dois (que era a causa da duplicação).
update projeto_produtos
set todas_ofertas = false
where produto_id = (select id from produtos where hotmart_id = '7744143')
  and projeto_id in (
    'c0b9d941-5637-48ac-96ea-321833340f5a', -- ℗TRÁFEGO - [PEDRO]
    '4f1affab-bd9f-4583-b133-e1a57741cab1'  -- 📲APP-INGLES
  );

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select 'c0b9d941-5637-48ac-96ea-321833340f5a', id, 'uuia1eai', '25 DOL (tráfego)'
from produtos where hotmart_id = '7744143'
on conflict do nothing;

-- Existem vendas abandonadas desse produto sem oferta_codigo (carrinho
-- abandonado antes de escolher/confirmar oferta) — ficam no bucket ''
-- do resumo. Sem sinal de origem, ficam no Tráfego (mesmo critério do
-- "sem rastreio" acima), senão sumiriam dos dois dashboards.
insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select 'c0b9d941-5637-48ac-96ea-321833340f5a', id, '', '(sem oferta) tráfego'
from produtos where hotmart_id = '7744143'
on conflict do nothing;

insert into projeto_produto_ofertas (projeto_id, produto_id, oferta_codigo, oferta_nome)
select '4f1affab-bd9f-4583-b133-e1a57741cab1', id, 'uuia1eai__app', '25 DOL (app)'
from produtos where hotmart_id = '7744143'
on conflict do nothing;
