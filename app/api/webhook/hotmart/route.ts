import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface HotmartCommission {
  source: string
  currency_value: string
  value: number
}

export async function POST(req: NextRequest) {
  console.log('🚀 Handler iniciado')
  try {
    console.log('📥 [1] Lendo body...')
    const body = await req.json()
    const evento = body?.event
    const dados = body?.data
    console.log('📦 Webhook recebido:', JSON.stringify({
      event: evento,
      transaction: dados?.purchase?.transaction,
      product: dados?.product?.name,
      buyer: dados?.buyer?.email,
    }))

    if (!dados) {
      console.warn('⚠️ [3] dados ausente — retornando 400')
      return NextResponse.json({ error: 'Sem dados' }, { status: 400 })
    }

    const hotmart_produto_id = String(dados.product?.id)
    const nome_produto = dados.product?.name
    console.log('📥 [4] produto_id:', hotmart_produto_id, '| nome:', nome_produto)

    if (hotmart_produto_id && nome_produto) {
      console.log('📥 [5] Upserting produto...')
      await supabase.from('produtos').upsert(
        { hotmart_id: hotmart_produto_id, nome: nome_produto },
        { onConflict: 'hotmart_id' },
      )
      console.log('📦 [5] Produto salvo:', hotmart_produto_id, nome_produto)
    }

    // Usa original_offer_price para evitar moeda local (ARS, COP, etc.); fallback para price
    const priceObj = dados.purchase?.original_offer_price ?? dados.purchase?.price
    const priceValue: number = priceObj?.value ?? 0
    const moeda: string = priceObj?.currency_value ?? 'BRL'
    const marketplaceCommission: number = ((dados.commissions ?? []) as HotmartCommission[])
      .find((c) => c.source === 'MARKETPLACE')?.value ?? 0
    const valor = parseFloat((priceValue - marketplaceCommission).toFixed(2))
    console.log('💵 [6] priceField:', dados.purchase?.original_offer_price ? 'original_offer_price' : 'price', '| priceValue:', priceValue, '| marketplace:', marketplaceCommission, '| valor:', valor, '| moeda:', moeda)

    // Concatena type com bandeira do cartão para melhor identificação
    const paymentType: string | null = dados.purchase?.payment?.type ?? null
    const cardBrand: string | null = dados.purchase?.payment?.card_type ?? dados.purchase?.payment?.brand ?? null
    const forma_pagamento = cardBrand ? `${paymentType}|${cardBrand}` : paymentType

    // Origem via UTM ou campo origin
    const origem: string | null =
      dados.purchase?.tracking_parameters?.utm_source ??
      dados.purchase?.origin ??
      null

    const transaction: string = dados.purchase?.transaction
    console.log('💵 [7] transaction:', transaction)

    const venda = {
      hotmart_id: transaction,
      hotmart_produto_id: hotmart_produto_id || null,
      produto: nome_produto,
      comprador_nome: dados.buyer?.name,
      comprador_email: dados.buyer?.email,
      valor,
      moeda,
      status: mapStatus(evento),
      pais: dados.buyer?.address?.country ?? null,
      forma_pagamento,
      origem,
      data_venda: dados.purchase?.order_date
        ? new Date(dados.purchase.order_date).toISOString()
        : new Date().toISOString(),
    }
    console.log('💾 [8] Objeto venda montado — hotmart_id:', venda.hotmart_id)

    console.log('💾 [9] Upserting venda no Supabase...')
    const { error } = await supabase
      .from('vendas')
      .upsert(venda, { onConflict: 'hotmart_id' })
    console.log('💾 [10] Upsert concluído — error:', error ? JSON.stringify(error) : 'null')

    if (error) {
      console.error('❌ Erro ao salvar venda:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('✅ Venda salva:', transaction)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('❌ Erro no webhook — tipo:', Object.prototype.toString.call(err))
    console.error('❌ Erro no webhook — mensagem:', err instanceof Error ? err.message : String(err))
    console.error('❌ Erro no webhook — stack:', err instanceof Error ? err.stack : 'N/A')
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
  }
  return map[evento] || 'pending'
}
