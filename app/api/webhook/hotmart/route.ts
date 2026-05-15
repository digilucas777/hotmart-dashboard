import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ---------- Hotmart API helpers ----------

async function getHotmartToken(): Promise<string | null> {
  const clientId = process.env.HOTMART_CLIENT_ID
  const clientSecret = process.env.HOTMART_CLIENT_SECRET

  console.log('🔑 [Hotmart] CLIENT_ID exists:', !!clientId)
  console.log('🔑 [Hotmart] CLIENT_SECRET exists:', !!clientSecret)

  if (!clientId || !clientSecret) {
    console.warn('⚠️ [Hotmart] Credenciais ausentes — abortando busca de token')
    return null
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  console.log('🔑 [Hotmart] Chamando endpoint de token...')

  try {
    const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })

    console.log('🔑 [Hotmart] Resposta do token — status:', res.status)

    if (!res.ok) {
      const body = await res.text()
      console.error('❌ [Hotmart] Falha ao obter token:', res.status, body)
      return null
    }

    const data = await res.json() as { access_token?: string; token_type?: string; expires_in?: number }
    console.log('🔑 [Hotmart] Token obtido — type:', data.token_type, '| expires_in:', data.expires_in)
    return data.access_token ?? null
  } catch (err) {
    console.error('❌ [Hotmart] Exceção ao chamar endpoint de token:', err)
    return null
  }
}

interface HotmartCommission {
  source: string
  currency_value: string
  value: number
}

async function fetchNetValue(
  token: string,
  transaction: string,
): Promise<{ valor: number; moeda: string } | null> {
  const url = `https://developers.hotmart.com/payments/api/v1/sales/summary?transaction=${transaction}`
  console.log('💰 [Hotmart] Chamando API de vendas — transaction:', transaction)
  console.log('💰 [Hotmart] URL:', url)

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    console.log('💰 [Hotmart] Resposta da API de vendas — status:', res.status)

    if (!res.ok) {
      const body = await res.text()
      console.error('❌ [Hotmart] Falha na API de vendas:', res.status, body)
      return null
    }

    const data = await res.json() as { items?: { commissions?: HotmartCommission[] }[] }
    const items = data?.items ?? []
    console.log('💰 [Hotmart] items retornados:', items.length)

    const commissions = items[0]?.commissions ?? []
    console.log('💰 [Hotmart] commissions sources:', commissions.map(c => `${c.source}:${c.value}`).join(', '))

    // Pega apenas a comissão do PRODUTOR — exclui AFFILIATE, COPRODUCER e MARKETPLACE
    const producer = commissions.filter(c => c.source === 'PRODUCER')
    console.log('💰 [Hotmart] comissão PRODUCER:', JSON.stringify(producer))

    if (producer.length === 0) {
      console.warn('⚠️ [Hotmart] Nenhuma comissão PRODUCER encontrada — sources disponíveis:', commissions.map(c => c.source).join(', '))
      return null
    }

    const valor = parseFloat(producer.reduce((s, c) => s + (c.value ?? 0), 0).toFixed(2))
    const moeda = producer[0].currency_value ?? 'BRL'
    console.log(`💰 [Hotmart] Valor PRODUCER: ${valor} ${moeda}`)
    return { valor, moeda }
  } catch (err) {
    console.error('❌ [Hotmart] Exceção ao chamar API de vendas:', err)
    return null
  }
}

// ---------- Webhook handler ----------

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

    // Fallback: apenas comissão PRODUCER do webhook (exclui AFFILIATE, COPRODUCER, MARKETPLACE)
    const comissoes: HotmartCommission[] = (dados.commissions ?? []).filter(
      (c: HotmartCommission) => c.source === 'PRODUCER',
    )
    const valorWebhook = parseFloat(
      comissoes.reduce((acc, c) => acc + (c.value ?? 0), 0).toFixed(2),
    )
    const moedaWebhook = comissoes[0]?.currency_value ?? 'BRL'
    console.log('💵 [6] valor:', valorWebhook, '| moeda:', moedaWebhook)

    const transaction: string = dados.purchase?.transaction
    console.log('💵 [7] transaction:', transaction)

    const venda = {
      hotmart_id: transaction,
      hotmart_produto_id: hotmart_produto_id || null,
      produto: nome_produto,
      comprador_nome: dados.buyer?.name,
      comprador_email: dados.buyer?.email,
      valor: valorWebhook,
      moeda: moedaWebhook,
      status: mapStatus(evento),
      pais: dados.buyer?.address?.country ?? null,
      forma_pagamento: dados.purchase?.payment?.type ?? null,
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

    // Tenta enriquecer com o valor líquido real da API Hotmart
    if (transaction) {
      console.log('🔄 [Hotmart] Iniciando busca de valor líquido para transaction:', transaction)
      try {
        const token = await getHotmartToken()
        if (token) {
          const net = await fetchNetValue(token, transaction)
          if (net) {
            const { error: updateError } = await supabase
              .from('vendas')
              .update({ valor: net.valor, moeda: net.moeda })
              .eq('hotmart_id', transaction)
            if (updateError) {
              console.error('❌ [Hotmart] Erro ao atualizar valor líquido:', updateError)
            } else {
              console.log(`✅ [Hotmart] Valor líquido salvo: ${net.valor} ${net.moeda}`)
            }
          }
        }
      } catch (err) {
        console.warn('⚠️ [Hotmart] Falha inesperada ao buscar valor líquido:', err)
      }
    }

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
