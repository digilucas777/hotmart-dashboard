import { createClient } from '@supabase/supabase-js'
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
      .filter((c: any) => c.currency_value === 'USD')
      .reduce((s: number, c: any) => s + Number(c.value), 0)

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

      // Se somaUSD for pelo menos 3x a taxa do marketplace, o payload está completo
      if (somaUSD >= taxaHotmartUSD * 3) {
        valorBruto = somaUSD
      } else if (origOffer?.currency_value === 'USD') {
        valorBruto = Number(origOffer.value) || 0
      } else {
        // Usa conversion_rate para converter original_offer_price para USD
        const rate = commissions.find((c: any) => c.currency_conversion?.conversion_rate)?.currency_conversion?.conversion_rate
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

    const origem: string | null =
      dados.purchase?.tracking_parameters?.utm_source ??
      dados.purchase?.origin ??
      null

    const transaction: string = dados.purchase?.transaction
    const venda = {
      hotmart_id: transaction,
      hotmart_produto_id: hotmart_produto_id || null,
      produto: nome_produto,
      comprador_nome: dados.buyer?.name,
      comprador_email: dados.buyer?.email,
      valor: valorOperacionalFinal,
      moeda,
      status,
      pais: dados.buyer?.address?.country ?? null,
      forma_pagamento,
      origem,
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
      const {
        valor_bruto,
        taxa_hotmart,
        comissao_produtor,
        comissao_afiliado,
        valor_operacional_final,
        ...legacyVenda
      } = venda
      const retry = await supabase
        .from('vendas')
        .upsert(legacyVenda, { onConflict: 'hotmart_id' })
      error = retry.error
    }

    if (error) {
      console.error('Erro ao salvar venda:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
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
