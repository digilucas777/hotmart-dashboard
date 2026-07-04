import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

const PAYMENT_LABELS: Record<string, string> = {
  CREDIT_CARD: 'Cartão de Crédito',
  PIX: 'Pix',
  PIX_AUTOMATIC: 'Pix Automático',
  BILLET: 'Boleto',
  PAYPAL: 'PayPal',
  APPLE_PAY: 'Apple Pay',
  GOOGLE_PAY: 'Google Pay',
  BANK_TRANSFER: 'Transferência Bancária',
  DIRECT_BANK_TRANSFER: 'Transferência Bancária',
  MERCADO_PAGO: 'Mercado Pago',
  KLARNA: 'Klarna',
  YAPE: 'Yape',
  NEQUI: 'Nequi',
  CASHPAYMENT: 'Dinheiro',
  HYBRID: 'Pagamento Híbrido',
  WALLET: 'Carteira Digital',
}

function paymentLabel(formaPagamento: string | null): string {
  if (!formaPagamento) return 'forma de pagamento não informada'
  const base = formaPagamento.split('|')[0]
  return PAYMENT_LABELS[base] ?? base
}

export type NotifCategory =
  | 'venda_realizada'
  | 'boleto_gerado'
  | 'pix_gerado'
  | 'vendas_pendentes'
  | 'reembolso'
  | 'venda_cancelada'

const TITLES: Record<NotifCategory, string> = {
  venda_realizada: 'Venda realizada!',
  boleto_gerado: 'Boleto gerado',
  pix_gerado: 'Pix gerado',
  vendas_pendentes: 'Venda pendente',
  reembolso: 'Reembolso processado',
  venda_cancelada: 'Venda cancelada',
}

export function resolveNotifCategory(
  evento: string,
  status: string,
  formaPagamento: string | null,
): NotifCategory | null {
  if (status === 'approved') return 'venda_realizada'
  if (status === 'refunded') return 'reembolso'
  if (status === 'cancelled') return 'venda_cancelada'

  const metodo = (formaPagamento ?? '').toUpperCase()

  if (evento === 'PURCHASE_BILLET_PRINTED') {
    if (metodo.startsWith('BILLET')) return 'boleto_gerado'
    if (metodo.startsWith('PIX')) return 'pix_gerado'
  }

  if (evento === 'PURCHASE_DELAYED' && metodo.startsWith('PIX')) {
    return 'pix_gerado'
  }

  if (status === 'pending') return 'vendas_pendentes'

  return null
}

export async function resolveProjeto(
  hotmartProdutoId: string | null,
): Promise<{ id: string; nome: string } | null> {
  if (!hotmartProdutoId) return null
  const { data: produto } = await supabase
    .from('produtos')
    .select('id')
    .eq('hotmart_id', hotmartProdutoId)
    .maybeSingle()
  if (!produto) return null

  const { data: link } = await supabase
    .from('projeto_produtos')
    .select('projeto_id, projetos(nome)')
    .eq('produto_id', produto.id)
    .maybeSingle()
  const projetoId = (link as { projeto_id?: string } | null)?.projeto_id
  if (!projetoId) return null

  const projetoNome = (link as { projetos?: { nome?: string } } | null)?.projetos?.nome
  if (projetoNome) return { id: projetoId, nome: projetoNome }

  const { data: projeto } = await supabase.from('projetos').select('nome').eq('id', projetoId).maybeSingle()
  return { id: projetoId, nome: projeto?.nome ?? 'Dashboard' }
}

export async function notifySale(params: {
  categoria: NotifCategory
  projetoId: string
  projetoNome: string
  valor: number
  moeda: string
  formaPagamento: string | null
  hotmartId: string
}) {
  try {
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('user_id')
      .eq('projeto_id', params.projetoId)
      .eq(params.categoria, true)

    const userIds = (prefs ?? []).map((p: { user_id: string }) => p.user_id)
    if (userIds.length === 0) return

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds)
    if (!subs || subs.length === 0) return

    const valorFormatado = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: params.moeda || 'BRL',
    }).format(params.valor)

    const title = TITLES[params.categoria]
    const body = `${params.projetoNome} — ${valorFormatado} via ${paymentLabel(params.formaPagamento)}`

    await Promise.all(
      subs.map(async (sub: { id: string; endpoint: string; p256dh: string; auth_key: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
            JSON.stringify({ title, body, url: '/vendas', tag: `venda-${params.hotmartId}` }),
          )
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number } | null)?.statusCode
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          } else {
            console.error('[PUSH] falha ao enviar:', err instanceof Error ? err.message : err)
          }
        }
      }),
    )
  } catch (err) {
    console.error('[PUSH] notifySale falhou:', err)
  }
}
