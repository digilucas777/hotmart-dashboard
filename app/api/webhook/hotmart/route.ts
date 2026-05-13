import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('📦 Webhook Hotmart recebido:', JSON.stringify(body, null, 2))

    const evento = body?.event
    const dados = body?.data

    if (!dados) return NextResponse.json({ error: 'Sem dados' }, { status: 400 })

    // Salva produto se não existir
    const hotmart_produto_id = String(dados.product?.id)
    const nome_produto = dados.product?.name

    if (hotmart_produto_id && nome_produto) {
      await supabase.from('produtos').upsert(
        { hotmart_id: hotmart_produto_id, nome: nome_produto },
        { onConflict: 'hotmart_id' }
      )
      console.log('📦 Produto salvo:', hotmart_produto_id, nome_produto)
    }

    // Salva venda
    const venda = {
      hotmart_id: dados.purchase?.transaction,
      produto: nome_produto,
      comprador_nome: dados.buyer?.name,
      comprador_email: dados.buyer?.email,
      valor: dados.purchase?.price?.value,
      status: mapStatus(evento),
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

    console.log('✅ Venda salva:', venda.hotmart_id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('❌ Erro no webhook:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

function mapStatus(evento: string): string {
  const map: Record<string, string> = {
    'PURCHASE_APPROVED': 'approved',
    'PURCHASE_REFUNDED': 'refunded',
    'PURCHASE_CANCELED': 'cancelled',
    'PURCHASE_COMPLETE': 'approved',
    'PURCHASE_PROTEST': 'refunded',
    'PURCHASE_DELAYED': 'pending',
  }
  return map[evento] || 'pending'
}