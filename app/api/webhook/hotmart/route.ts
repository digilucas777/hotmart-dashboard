import { createClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import { notifySale, resolveNotifCategory, resolveProjetos } from '@/lib/push'
import { fetchSaleFromAnyAccount, fetchCommissionsFromAnyAccount } from '@/lib/hotmart/api'


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

interface HotmartCommission {
  source: string
  currency_value: string
  value: number
  currency_conversion?: { conversion_rate?: number }
}

const COMMISSION_TYPES = ['PRODUCER','MARKETPLACE','AFFILIATE','COPRODUCER','SELLER','VENDOR','OWNER']

function extractOrigem(purchase: any, commissions: any[]): string | null {
  const origemObj = purchase?.origin
  const commissionSource = commissions?.[0]?.source
  const commissionSourceClean =
    commissionSource &&
    !COMMISSION_TYPES.some(t => String(commissionSource).toUpperCase().includes(t))
      ? String(commissionSource)
      : null
  const source =
    purchase?.tracking?.source ??
    purchase?.tracking?.external_reference ??
    purchase?.tracking_parameters?.utm_source ??
    (typeof origemObj === 'object' && origemObj !== null
      ? (origemObj.src ?? origemObj.sck ?? null)
      : typeof origemObj === 'string' ? origemObj : null) ??
    commissionSourceClean ??
    null
  return source && typeof source === 'string' && source.trim() !== '' ? source.trim() : null
}

function sameCurrencyValue(commissions: HotmartCommission[], currency: string, matcher: (source: string) => boolean) {
  return commissions
    .filter((c) => c.currency_value === currency && matcher(String(c.source ?? '').toUpperCase()))
    .reduce((sum, c) => sum + (Number(c.value) || 0), 0)
}

function roundMoney(value: number) {
  return parseFloat(value.toFixed(2))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const evento = body?.event
    const dados = body?.data

    if (!dados) {
      return NextResponse.json({ error: 'Sem dados' }, { status: 400 })
    }

    const hotmart_produto_id = String(dados.product?.id)
    const nome_produto = dados.product?.name

    if (hotmart_produto_id && nome_produto) {
      await supabase.from('produtos').upsert(
        { hotmart_id: hotmart_produto_id, nome: nome_produto },
        { onConflict: 'hotmart_id' },
      )
    }

    const priceCurrency: string = dados.purchase?.price?.currency_value ?? 'BRL'
    const commissions = (dados.commissions ?? []) as HotmartCommission[]
    let moeda: string
    let valorBruto: number
    let taxaHotmart: number
    let comissaoProdutor: number
    let coproducerCommission: number
    let comissaoAfiliado: number

    if (priceCurrency === 'BRL') {
      moeda = 'BRL'
      valorBruto = Number(dados.purchase?.price?.value ?? 0)
      taxaHotmart = sameCurrencyValue(commissions, 'BRL', source => source === 'MARKETPLACE')
      comissaoProdutor = sameCurrencyValue(commissions, 'BRL', source =>
        source === 'PRODUCER' || source === 'SELLER' || source === 'VENDOR' || source.includes('OWNER'),
      )
      coproducerCommission = sameCurrencyValue(commissions, 'BRL', source =>
        source.includes('COPRODUCER') || source.includes('CO_PRODUCER') || source.includes('CO-PRODUCER') || source.includes('COPRODUTOR'),
      )
      comissaoAfiliado = sameCurrencyValue(commissions, 'BRL', source =>
        source.includes('AFFILIATE') || source.includes('AFILIADO'),
      )
    } else if (priceCurrency === 'USD') {
      moeda = 'USD'
      valorBruto = Number(dados.purchase?.price?.value ?? 0)
      taxaHotmart = sameCurrencyValue(commissions, 'USD', source => source === 'MARKETPLACE')
      comissaoProdutor = sameCurrencyValue(commissions, 'USD', source =>
        source === 'PRODUCER' || source === 'SELLER' || source === 'VENDOR' || source.includes('OWNER'),
      )
      coproducerCommission = sameCurrencyValue(commissions, 'USD', source =>
        source.includes('COPRODUCER') || source.includes('CO_PRODUCER') || source.includes('CO-PRODUCER') || source.includes('COPRODUTOR'),
      )
      comissaoAfiliado = sameCurrencyValue(commissions, 'USD', source =>
        source.includes('AFFILIATE') || source.includes('AFILIADO'),
      )
    } else {
      // Moeda exótica (ARS, MXN, COP, AUD, etc): a Hotmart NÃO manda um campo confiável
      // com o total da venda em USD (price.value fica na moeda local, e original_offer_price
      // reflete o preço original da oferta, em qualquer moeda que o produtor configurou —
      // não necessariamente USD). O que É confiável é que cada linha de commissions[] vem
      // convertida para USD pela Hotmart. Como estimativa imediata, somamos todas as
      // comissões em USD (cobre o caso sem coprodução). Se houver coprodução, o webhook
      // desta conta só mostra a fatia dela — o valor é corrigido em segundo plano abaixo
      // usando o percentual/fixo da taxa Hotmart buscado na API.
      moeda = 'USD'
      taxaHotmart = sameCurrencyValue(commissions, 'USD', source => source === 'MARKETPLACE')
      valorBruto = sameCurrencyValue(commissions, 'USD', () => true)
      comissaoProdutor = sameCurrencyValue(commissions, 'USD', source =>
        source === 'PRODUCER' || source === 'SELLER' || source === 'VENDOR' || source.includes('OWNER'),
      )
      coproducerCommission = sameCurrencyValue(commissions, 'USD', source =>
        source.includes('COPRODUCER') || source.includes('CO_PRODUCER') || source.includes('CO-PRODUCER') || source.includes('COPRODUTOR'),
      )
      comissaoAfiliado = sameCurrencyValue(commissions, 'USD', source =>
        source.includes('AFFILIATE') || source.includes('AFILIADO'),
      )
    }
    const status = mapStatus(evento)
    const valorOperacionalFinal = status === 'abandoned'
      ? 0
      : roundMoney(valorBruto - taxaHotmart)

    const paymentType: string | null = dados.purchase?.payment?.type ?? null
    const cardBrand: string | null = dados.purchase?.payment?.card_type ?? dados.purchase?.payment?.brand ?? null
    const forma_pagamento = cardBrand ? `${paymentType}|${cardBrand}` : paymentType

    const hotmartId: string | null = dados.purchase?.transaction ?? null
    const hasCoprod: boolean = dados.product?.has_co_production === true

    const origem: string | null = extractOrigem(dados.purchase, dados.commissions ?? [])

    console.log('[WEBHOOK ORIGEM]', {
      hotmartId,
      origem,
      temTracking: !!dados.purchase?.tracking,
      trackingSource: dados.purchase?.tracking?.source,
      originObj: dados.purchase?.origin,
    })

    const afiliado_nome: string | null =
      dados.affiliates?.[0]?.name ??
      dados.purchase?.affiliates?.[0]?.name ??
      null
    console.log('[WEBHOOK] afiliado_nome:', afiliado_nome)

    const offer = dados.purchase?.offer
    const oferta_codigo: string | null = offer?.code ? String(offer.code) : null
    const oferta_nome: string | null = offer?.name ? String(offer.name) : null
    const oferta_descricao: string | null = offer?.description ? String(offer.description) : null
    const oferta_preco: number | null =
      dados.purchase?.original_offer_price?.value != null
        ? Number(dados.purchase.original_offer_price.value)
        : dados.purchase?.price?.value != null
          ? Number(dados.purchase.price.value)
          : null
    const oferta_moeda: string | null =
      dados.purchase?.original_offer_price?.currency_value ??
      dados.purchase?.price?.currency_value ??
      null
    const plano_id: string | null = dados.subscription?.plan?.id ? String(dados.subscription.plan.id) : null
    const plano_nome: string | null = dados.subscription?.plan?.name ? String(dados.subscription.plan.name) : null

    const transaction: string = dados.purchase?.transaction
    const venda = {
      hotmart_id: transaction,
      hotmart_produto_id: hotmart_produto_id || null,
      produto: nome_produto,
      oferta_codigo,
      oferta_nome,
      oferta_descricao,
      oferta_preco,
      oferta_moeda,
      plano_id,
      plano_nome,
      comprador_nome: dados.buyer?.name,
      comprador_email: dados.buyer?.email,
      valor: valorOperacionalFinal,
      moeda,
      status,
      pais: dados.buyer?.address?.country ?? null,
      forma_pagamento,
      origem,
      afiliado_nome,
      valor_recebido: comissaoProdutor,
      valor_bruto: valorBruto,
      taxa_hotmart: taxaHotmart,
      comissao_produtor: comissaoProdutor,
      comissao_coprodutor: coproducerCommission,
      comissao_afiliado: comissaoAfiliado,
      valor_operacional_final: valorOperacionalFinal,
      hotmart_payload: body,
      data_venda: dados.purchase?.order_date
        ? new Date(dados.purchase.order_date).toISOString()
        : new Date().toISOString(),
    }

    let { error } = await supabase
      .from('vendas')
      .upsert(venda, { onConflict: 'hotmart_id' })

    if (error && (error.message.includes('schema cache') || error.message.includes('valor_operacional_final'))) {
      const legacyVenda: Partial<typeof venda> = { ...venda }
      delete legacyVenda.valor_bruto
      delete legacyVenda.taxa_hotmart
      delete legacyVenda.comissao_produtor
      delete legacyVenda.comissao_afiliado
      delete legacyVenda.valor_operacional_final
      delete legacyVenda.oferta_codigo
      delete legacyVenda.oferta_nome
      delete legacyVenda.oferta_descricao
      delete legacyVenda.oferta_preco
      delete legacyVenda.oferta_moeda
      delete legacyVenda.plano_id
      delete legacyVenda.plano_nome
      const retry = await supabase
        .from('vendas')
        .upsert(legacyVenda, { onConflict: 'hotmart_id' })
      error = retry.error
    }

    if (error) {
      console.error('Erro ao salvar venda:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Hotmart às vezes não inclui tracking no payload do webhook mesmo quando existe na API.
    // Se origem ficou null, buscamos da API em background sem atrasar a resposta.
    // Tenta as duas contas porque a venda pode ter sido criada em qualquer uma delas.
    if (!origem && hotmartId) {
      after(async () => {
        try {
          const item = await fetchSaleFromAnyAccount(hotmartId)
          const origemApi = extractOrigem(item?.purchase, item?.commissions ?? [])
          if (!origemApi) return

          await supabase.from('vendas').update({ origem: origemApi }).eq('hotmart_id', hotmartId)
          console.log(`[WEBHOOK AFTER] origem da API: ${hotmartId} → ${origemApi}`)
        } catch (err) {
          console.error('[WEBHOOK AFTER] erro ao sincronizar origem:', err)
        }
      })
    }

    // Notificação push de venda — nunca pode atrasar nem quebrar a resposta
    // do webhook, por isso roda em segundo plano (after) com seus próprios
    // try/catch internos (ver lib/push.ts).
    const categoria = resolveNotifCategory(evento, status, forma_pagamento)
    const sendNotification = (valorNotificado: number) => {
      if (!categoria || !hotmart_produto_id) return
      after(async () => {
        const projetos = await resolveProjetos(hotmart_produto_id, oferta_codigo)
        await Promise.all(projetos.map(projeto => notifySale({
          categoria,
          projetoId: projeto.id,
          projetoNome: projeto.nome,
          valor: valorNotificado,
          moeda,
          formaPagamento: forma_pagamento,
          hotmartId: transaction,
        })))
      })
    }

    // Moeda exótica COM coprodução: o valor síncrono (soma das commissions do payload do
    // webhook) fica incompleto porque o webhook desta conta só enxerga a própria fatia.
    // Busca o breakdown completo (produtor + coprodutor + afiliado, já convertido para USD
    // pela Hotmart) via GET /sales/commissions — o mesmo endpoint que scripts/_report-
    // aprovadas-liquido-usd.ts já usa com sucesso para obter o valor líquido real.
    // (Tentativa anterior reconstruía o bruto a partir do percentual/fixo da taxa Hotmart;
    // essa fórmula se mostrou pouco confiável — o "fixed" não é distribuído igualmente entre
    // itens de um mesmo carrinho, então o resultado variava bastante do valor real da Hotmart.)
    // A taxa MARKETPLACE não aparece em /sales/commissions (não é uma comissão paga a
    // alguém), por isso mantém a taxaHotmart já calculada de forma síncrona a partir do
    // payload original do webhook — essa parte sempre foi confiável.
    //
    // A notificação de venda também depende dessa correção: notificar com o valor
    // síncrono (incompleto) mostraria uma quantia errada — por isso, quando esse
    // ajuste se aplica, a notificação só dispara aqui dentro, com o valor já corrigido,
    // em vez de junto com a resposta do webhook.
    if (hotmartId && hasCoprod && priceCurrency !== 'BRL' && priceCurrency !== 'USD' && taxaHotmart > 0) {
      after(async () => {
        try {
          const item = await fetchCommissionsFromAnyAccount(hotmartId)
          const commissionsApi = (item?.commissions ?? []) as any[]
          if (commissionsApi.length === 0) {
            console.log(`[WEBHOOK EXOTIC FEE] ${hotmartId}: sem resposta de /sales/commissions, mantém valor síncrono`)
            sendNotification(valorOperacionalFinal)
            return
          }

          let produtorCorrigido = 0
          let coprodutorCorrigido = 0
          let afiliadoCorrigido = 0
          for (const c of commissionsApi) {
            const source = String(c?.commission?.source ?? c?.source ?? '').toUpperCase()
            const currency = c?.commission?.currency_code ?? c?.currency_code
            const value = Number(c?.commission?.value ?? c?.value ?? 0)
            if (currency && currency !== 'USD') {
              console.error(`[WEBHOOK EXOTIC FEE] ${hotmartId}: comissao em moeda inesperada ${currency}`)
              continue
            }
            if (source.includes('COPRODUC')) coprodutorCorrigido += value
            else if (source.includes('AFFILIATE') || source.includes('AFILIADO')) afiliadoCorrigido += value
            else if (source === 'PRODUCER' || source === 'SELLER' || source === 'VENDOR' || source.includes('OWNER')) produtorCorrigido += value
          }

          const valorCorrigido = status === 'abandoned' ? 0 : roundMoney(produtorCorrigido + coprodutorCorrigido + afiliadoCorrigido)
          const brutoCorrigido = roundMoney(valorCorrigido + taxaHotmart)
          await supabase.from('vendas').update({
            valor_bruto: brutoCorrigido,
            valor: valorCorrigido,
            valor_operacional_final: valorCorrigido,
            comissao_produtor: roundMoney(produtorCorrigido),
            comissao_coprodutor: roundMoney(coprodutorCorrigido),
            comissao_afiliado: roundMoney(afiliadoCorrigido),
            valor_recebido: roundMoney(produtorCorrigido),
          }).eq('hotmart_id', hotmartId)
          console.log(`[WEBHOOK EXOTIC FEE] ${hotmartId}: bruto=${brutoCorrigido} taxa=${taxaHotmart} valor=${valorCorrigido}`)
          sendNotification(valorCorrigido)
        } catch (err) {
          console.error('[WEBHOOK EXOTIC FEE] erro:', err)
          sendNotification(valorOperacionalFinal)
        }
      })
    } else {
      sendNotification(valorOperacionalFinal)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Erro no webhook:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

function mapStatus(evento: string): string {
  const map: Record<string, string> = {
    PURCHASE_APPROVED: 'approved',
    PURCHASE_REFUNDED: 'refunded',
    PURCHASE_CANCELED: 'cancelled',
    PURCHASE_COMPLETE: 'approved',
    PURCHASE_PROTEST: 'disputed',
    PURCHASE_CHARGEBACK: 'chargeback',
    PURCHASE_DELAYED: 'pending',
    PURCHASE_OUT_OF_SHOPPING_CART: 'abandoned',
  }
  return map[evento] || 'pending'
}
