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
  if (!clientId || !clientSecret) return null

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  try {
    const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    if (!res.ok) return null
    const data = await res.json() as { access_token?: string }
    return data.access_token ?? null
  } catch {
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
  try {
    const res = await fetch(
      `https://developers.hotmart.com/payments/api/v1/sales/summary?transaction_id=${transaction}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return null
    const data = await res.json() as { items?: { commissions?: HotmartCommission[] }[] }
    const commissions = data?.items?.[0]?.commissions ?? []
    const net = commissions.filter(c => c.source !== 'MARKETPLACE')
    if (net.length === 0) return null
    const valor = parseFloat(net.reduce((s, c) => s + (c.value ?? 0), 0).toFixed(2))
    const moeda = net[0].currency_value ?? 'BRL'
    return { valor, moeda }
  } catch {
    return null
  }
}

// ---------- Webhook handler ----------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('📦 Webhook Hotmart recebido:', JSON.stringify(body, null, 2))

    const evento = body?.event
    const dados = body?.data

    if (!dados) return NextResponse.json({ error: 'Sem dados' }, { status: 400 })

    const hotmart_produto_id = String(dados.product?.id)
    const nome_produto = dados.product?.name

    if (hotmart_produto_id && nome_produto) {
      await supabase.from('produtos').upsert(
        { hotmart_id: hotmart_produto_id, nome: nome_produto },
        { onConflict: 'hotmart_id' },
      )
      console.log('📦 Produto salvo:', hotmart_produto_id, nome_produto)
    }

    // Valor inicial a partir do payload do webhook (fallback)
    const comissoes: HotmartCommission[] = dados.commissions ?? []
    const valorWebhook = parseFloat(
      comissoes.reduce((acc, c) => acc + (c.value ?? 0), 0).toFixed(2),
    )
    const moedaWebhook = comissoes[0]?.currency_value ?? 'BRL'

    const transaction: string = dados.purchase?.transaction

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

    const { error } = await supabase
      .from('vendas')
      .upsert(venda, { onConflict: 'hotmart_id' })

    if (error) {
      console.error('❌ Erro ao salvar venda:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('✅ Venda salva:', transaction)

    // Tenta enriquecer com o valor líquido real da API Hotmart
    if (transaction) {
      try {
        const token = await getHotmartToken()
        if (token) {
          const net = await fetchNetValue(token, transaction)
          if (net) {
            await supabase
              .from('vendas')
              .update({ valor: net.valor, moeda: net.moeda })
              .eq('hotmart_id', transaction)
            console.log(`💰 Valor líquido atualizado: ${net.valor} ${net.moeda}`)
          } else {
            console.warn('⚠️ API Hotmart não retornou comissões líquidas — mantendo valor do webhook')
          }
        } else {
          console.warn('⚠️ Token Hotmart não obtido — HOTMART_CLIENT_ID/SECRET configurados?')
        }
      } catch (err) {
        console.warn('⚠️ Falha ao buscar valor líquido da API Hotmart:', err)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('❌ Erro no webhook:', err)
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
