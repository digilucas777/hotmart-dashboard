import { createClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import { notifySale, resolveNotifCategory, resolveProjetos } from '@/lib/push'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// A tela de conexão "Webhook" da Digistore24 manda os dados como parâmetros
// GET na própria URL (não como corpo JSON, diferente da Hotmart) e não tem
// assinatura criptográfica — por isso a autenticação é um "?secret=" colado
// na própria URL de webhook, igual ao padrão já usado no Rastreamento.
//
// Mapeamento de evento -> status ainda não confirmado com uma venda real
// (a Digistore24 não documentou os valores exatos na tela de configuração).
// Fallback seguro pra qualquer valor não reconhecido: 'pending', igual o
// mapStatus() do webhook da Hotmart já faz.
const EVENT_STATUS_MAP: Record<string, string> = {
  payment: 'approved',
  refund: 'refunded',
  chargeback: 'chargeback',
  payment_denial: 'pending',
  rebill_cancelled: 'cancelled',
  rebill_resumed: 'approved',
  rebill_missed: 'pending',
  rebill_stopped: 'cancelled',
}

function mapStatus(evento: string | null): string {
  if (!evento) return 'pending'
  return EVENT_STATUS_MAP[evento] ?? 'pending'
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    if (params.get('secret') !== process.env.DIGISTORE24_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const get = (name: string) => params.get(name) || null

    const productId = get('product_id')
    const productName = get('product_name')

    if (productId && productName) {
      await supabase.from('produtos').upsert(
        { hotmart_id: productId, nome: productName },
        { onConflict: 'hotmart_id' },
      )
    }

    const transactionId = get('transaction_id') ?? get('order_id')
    if (!transactionId) {
      return NextResponse.json({
        ok: true,
        info: 'produto cadastrado, sem transaction_id/order_id — venda não registrada',
      })
    }

    const evento = get('event')
    const status = mapStatus(evento)
    const moeda = get('currency') ?? 'USD'
    const amountBrutto = Number(get('amount_brutto') ?? 0)
    const amountNetto = Number(get('amount_netto') ?? 0)
    const amountVendor = Number(get('amount_vendor') ?? 0)
    const amountAffiliate = Number(get('amount_affiliate') ?? 0)
    const taxaPlataforma = parseFloat((amountBrutto - amountNetto).toFixed(2))

    const nome = [get('first_name'), get('last_name')].filter(Boolean).join(' ') || null

    const rawPayload = Object.fromEntries(params.entries())

    const venda = {
      digistore_id: transactionId,
      hotmart_produto_id: productId,
      produto: productName,
      comprador_nome: nome,
      comprador_email: get('email'),
      valor: amountVendor,
      valor_operacional_final: amountVendor,
      valor_bruto: amountBrutto,
      taxa_hotmart: taxaPlataforma,
      comissao_afiliado: amountAffiliate,
      moeda,
      status,
      pais: get('country_name'),
      origem: get('utm_source'),
      hotmart_payload: rawPayload,
      data_venda: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('vendas')
      .upsert(venda, { onConflict: 'digistore_id' })

    if (error) {
      console.error('[webhook digistore24] erro ao salvar venda:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Notificação push de venda — mesmo fluxo já usado pela Hotmart
    // (lib/push.ts). resolveNotifCategory espera o evento literal
    // 'PURCHASE_APPROVED' pra categorizar como "venda_realizada" (é assim
    // que ela distingue 1ª aprovação de um evento de acompanhamento tardio
    // específico da Hotmart) — como a Digistore24 não tem esse 2º evento
    // no nosso mapeamento, todo status "approved" aqui já é uma aprovação
    // nova de verdade, então usamos o mesmo literal pra cair na categoria
    // certa sem duplicar a lógica de categorização.
    const categoria = resolveNotifCategory(status === 'approved' ? 'PURCHASE_APPROVED' : (evento ?? ''), status, null)
    if (categoria && productId) {
      after(async () => {
        const projetos = await resolveProjetos(productId, null)
        await Promise.all(projetos.map(projeto => notifySale({
          categoria,
          projetoId: projeto.id,
          projetoNome: projeto.nome,
          valor: amountVendor,
          moeda,
          formaPagamento: null,
          hotmartId: transactionId,
        })))
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook digistore24] erro:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
