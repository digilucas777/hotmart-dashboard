import { createClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'


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
    const somaUSD = commissions
      .filter((c) => c.currency_value === 'USD')
      .reduce((s: number, c) => s + Number(c.value), 0)

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
      comissaoProdutor = valorBruto
      coproducerCommission = sameCurrencyValue(commissions, 'USD', source =>
        source.includes('COPRODUCER') || source.includes('CO_PRODUCER') || source.includes('CO-PRODUCER') || source.includes('COPRODUTOR'),
      )
      comissaoAfiliado = sameCurrencyValue(commissions, 'USD', source =>
        source.includes('AFFILIATE') || source.includes('AFILIADO'),
      )
    } else {
      // Outra moeda (MXN, EUR, GBP, etc): converte para USD
      moeda = 'USD'
      const origOffer = dados.purchase?.original_offer_price
      const taxaHotmartUSD = sameCurrencyValue(commissions, 'USD', source => source === 'MARKETPLACE')

      if (origOffer?.currency_value === 'USD') {
        valorBruto = Number(origOffer.value) || 0
      } else {
        const rate = commissions.find((c) => c.currency_conversion?.conversion_rate)?.currency_conversion?.conversion_rate
        const priceValue = origOffer?.value ?? dados.purchase?.price?.value
        valorBruto = rate ? roundMoney(Number(priceValue) / rate) : somaUSD
      }
      taxaHotmart = taxaHotmartUSD
      comissaoProdutor = valorBruto
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
    // Tenta a conta 1 e, se não encontrar resultado, tenta a conta 2.
    if (!origem && hotmartId) {
      after(async () => {
        try {
          const accounts = [
            { id: process.env.HOTMART_CLIENT_ID, secret: process.env.HOTMART_CLIENT_SECRET },
            { id: process.env.HOTMART_CLIENT_ID_2, secret: process.env.HOTMART_CLIENT_SECRET_2 },
          ]

          for (const account of accounts) {
            if (!account.id || !account.secret) continue

            const tokenRes = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
              method: 'POST',
              headers: {
                Authorization: `Basic ${Buffer.from(`${account.id}:${account.secret}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: 'grant_type=client_credentials',
            })
            if (!tokenRes.ok) continue
            const { access_token: token } = await tokenRes.json()

            const histRes = await fetch(
              `https://developers.hotmart.com/payments/api/v1/sales/history?transaction=${encodeURIComponent(hotmartId)}`,
              { headers: { Authorization: `Bearer ${token}` } },
            )
            if (!histRes.ok) continue
            const histData = await histRes.json()
            const item = histData?.items?.[0]
            if (!item) continue

            const origemApi = extractOrigem(item?.purchase, item?.commissions ?? [])
            if (!origemApi) break

            await supabase.from('vendas').update({ origem: origemApi }).eq('hotmart_id', hotmartId)
            console.log(`[WEBHOOK AFTER] origem da API: ${hotmartId} → ${origemApi}`)
            break
          }
        } catch (err) {
          console.error('[WEBHOOK AFTER] erro ao sincronizar origem:', err)
        }
      })
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
    PURCHASE_PROTEST: 'refunded',
    PURCHASE_DELAYED: 'pending',
    PURCHASE_OUT_OF_SHOPPING_CART: 'abandoned',
  }
  return map[evento] || 'pending'
}
