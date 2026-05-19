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
}

function sameCurrencyValue(commissions: HotmartCommission[], currency: string, matcher: (source: string) => boolean) {
  return commissions
    .filter((c) => c.currency_value === currency && matcher(String(c.source ?? '').toUpperCase()))
    .reduce((sum, c) => sum + (Number(c.value) || 0), 0)
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

    const priceObj = dados.purchase?.original_offer_price ?? dados.purchase?.price
    const priceValue: number = Number(priceObj?.value ?? 0)
    const moeda: string = priceObj?.currency_value ?? 'BRL'
    const commissions = (dados.commissions ?? []) as HotmartCommission[]
    const marketplaceCommission = sameCurrencyValue(commissions, moeda, source => source === 'MARKETPLACE')
    const receivedCommission = sameCurrencyValue(commissions, moeda, source =>
      source === 'PRODUCER' || source === 'SELLER' || source === 'VENDOR' || source.includes('OWNER'),
    )
    const coproducerCommission = sameCurrencyValue(commissions, moeda, source =>
      source.includes('COPRODUCER') || source.includes('CO_PRODUCER') || source.includes('CO-PRODUCER') || source.includes('COPRODUTOR'),
    )
    const status = mapStatus(evento)
    const fallbackReceived = parseFloat((priceValue - marketplaceCommission).toFixed(2))
    const valorRecebido = receivedCommission > 0 ? receivedCommission : fallbackReceived
    const valor = status === 'abandoned'
      ? 0
      : parseFloat((valorRecebido + coproducerCommission).toFixed(2))

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
      valor,
      moeda,
      status,
      pais: dados.buyer?.address?.country ?? null,
      forma_pagamento,
      origem,
      valor_recebido: valorRecebido,
      comissao_coprodutor: coproducerCommission,
      hotmart_payload: body,
      data_venda: dados.purchase?.order_date
        ? new Date(dados.purchase.order_date).toISOString()
        : new Date().toISOString(),
    }

    const { error } = await supabase
      .from('vendas')
      .upsert(venda, { onConflict: 'hotmart_id' })

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
