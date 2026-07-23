import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

let vapidConfigured = false

// Configurado sob demanda (não no carregamento do módulo) — o Next.js
// carrega este arquivo durante o build para analisar a rota do webhook,
// e nesse momento as variáveis de ambiente de runtime podem não estar
// presentes. Chamar isso só quando uma notificação é realmente enviada
// evita quebrar o build por causa de configuração de push.
function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true
  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) {
    console.error('[PUSH] VAPID_SUBJECT/NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configurados — notificação não enviada.')
    return false
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

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

const STATIC_TITLES: Record<Exclude<NotifCategory, 'venda_realizada'>, string> = {
  boleto_gerado: 'Boleto gerado',
  pix_gerado: 'Pix gerado',
  vendas_pendentes: 'Venda pendente',
  reembolso: 'Reembolso processado',
  venda_cancelada: 'Venda cancelada',
}

function buildTitle(categoria: NotifCategory, formaPagamento: string | null): string {
  if (categoria === 'venda_realizada') return `Venda realizada com ${paymentLabel(formaPagamento)}`
  return STATIC_TITLES[categoria]
}

export function resolveNotifCategory(
  evento: string,
  status: string,
  formaPagamento: string | null,
): NotifCategory | null {
  // PURCHASE_COMPLETE chega dias depois (quando a garantia de 7 dias termina)
  // para a MESMA venda que já virou PURCHASE_APPROVED antes — mapeia pro mesmo
  // status "approved" pro dashboard (a venda continua aprovada), mas não deve
  // gerar uma nova notificação de "venda realizada" pra uma venda antiga.
  if (status === 'approved' && evento === 'PURCHASE_APPROVED') return 'venda_realizada'
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

// Um mesmo produto Hotmart pode estar vinculado a mais de um projeto (ex:
// o mesmo produto rastreado em dois dashboards diferentes) — por isso
// retorna uma lista, nunca um único projeto.
export async function resolveProjetos(
  hotmartProdutoId: string | null,
  ofertaCodigo: string | null,
): Promise<{ id: string; nome: string }[]> {
  if (!hotmartProdutoId) return []
  const { data: produto } = await supabase
    .from('produtos')
    .select('id')
    .eq('hotmart_id', hotmartProdutoId)
    .maybeSingle()
  if (!produto) return []

  const { data: links } = await supabase
    .from('projeto_produtos')
    .select('projeto_id, todas_ofertas, projetos(nome)')
    .eq('produto_id', produto.id)
  if (!links || links.length === 0) return []

  const rows = links as { projeto_id: string; todas_ofertas: boolean | null; projetos?: { nome?: string } | null }[]

  // Um mesmo produto pode estar vinculado a vários projetos, cada um com sua
  // própria seleção de ofertas (todas_ofertas=false + projeto_produto_ofertas)
  // — mesma regra que o dashboard já aplica (filterRowsByOfferSelection, em
  // DashboardClient.tsx). Sem isso, um projeto configurado pra só contar
  // ofertas específicas recebia notificação de QUALQUER venda do produto,
  // mesmo de ofertas que ele explicitamente não seleciona.
  const restritos = rows.filter(r => r.todas_ofertas === false)
  const ofertasPermitidas = new Map<string, Set<string>>()
  if (restritos.length > 0) {
    const { data: ofertas } = await supabase
      .from('projeto_produto_ofertas')
      .select('projeto_id, oferta_codigo')
      .eq('produto_id', produto.id)
      .in('projeto_id', restritos.map(r => r.projeto_id))
    for (const o of (ofertas ?? []) as { projeto_id: string; oferta_codigo: string }[]) {
      if (!ofertasPermitidas.has(o.projeto_id)) ofertasPermitidas.set(o.projeto_id, new Set())
      ofertasPermitidas.get(o.projeto_id)!.add(o.oferta_codigo)
    }
  }

  return rows
    .filter(r => {
      if (r.todas_ofertas !== false) return true
      const permitidas = ofertasPermitidas.get(r.projeto_id)
      return !!ofertaCodigo && !!permitidas?.has(ofertaCodigo)
    })
    .map(r => ({ id: r.projeto_id, nome: r.projetos?.nome ?? 'Dashboard' }))
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
    if (!ensureVapidConfigured()) return

    // A Hotmart às vezes manda um webhook de venda aprovada sem os dados de
    // preço/comissão (payload incompleto) — nesse caso o valor calculado vem
    // zerado. Não registra no dedup (pra não bloquear a notificação de verdade
    // quando o webhook correto chegar) nem envia uma notificação de venda com
    // R$/US$ 0,00, que só confunde.
    if (params.categoria === 'venda_realizada' && !(params.valor > 0)) {
      console.error(`[PUSH] ${params.hotmartId}: valor zerado ou inválido (${params.valor}), notificação de venda_realizada ignorada`)
      return
    }

    // Evita notificar duas vezes a mesma venda/projeto/categoria (a Hotmart
    // às vezes manda mais de um webhook pro mesmo evento). Se já existe um
    // registro, essa combinação já foi notificada — não envia de novo.
    const { error: dedupError } = await supabase.from('notified_sale_events').insert({
      hotmart_id: params.hotmartId,
      projeto_id: params.projetoId,
      categoria: params.categoria,
    })
    if (dedupError) {
      if (dedupError.code === '23505') return // já notificado
      console.error('[PUSH] falha ao registrar dedup, enviando mesmo assim:', dedupError.message)
    }

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

    const title = buildTitle(params.categoria, params.formaPagamento)
    const body = `Hotmart: ${params.projetoNome}\n${valorFormatado} • ${params.hotmartId}`

    const resultados = await Promise.all(
      subs.map(async (sub: { id: string; endpoint: string; p256dh: string; auth_key: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
            JSON.stringify({ title, body, icon: '/icon-192.png', url: `/dashboard/${params.projetoId}`, tag: `venda-${params.hotmartId}` }),
          )
          return 'ok'
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number } | null)?.statusCode
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
            return 'inscricao_removida'
          }
          console.error('[PUSH] falha ao enviar:', err instanceof Error ? err.message : err)
          return 'erro'
        }
      }),
    )
    console.log(`[PUSH] ${params.hotmartId}/${params.categoria}: ${resultados.filter(r => r === 'ok').length}/${resultados.length} enviados (${resultados.join(', ')})`)

    // Se TODAS as tentativas falharam de verdade (rede, chave errada, timeout — não
    // 404/410 de inscrição morta), desfaz o registro de dedup que inserimos antes de
    // tentar enviar. Sem isso, uma falha real de envio ficava marcada como "notificado"
    // pra sempre, e um webhook duplicado da Hotmart pra mesma venda (que às vezes chega
    // de propósito, ex. PURCHASE_APPROVED + PURCHASE_COMPLETE) nunca teria uma segunda
    // chance de tentar de novo.
    if (resultados.length > 0 && resultados.every(r => r === 'erro')) {
      await supabase
        .from('notified_sale_events')
        .delete()
        .eq('hotmart_id', params.hotmartId)
        .eq('projeto_id', params.projetoId)
        .eq('categoria', params.categoria)
    }
  } catch (err) {
    console.error('[PUSH] notifySale falhou:', err)
  }
}

const SITE_STATUS_LABELS: Record<string, string> = {
  fora_do_ar: 'está fora do ar',
  erro_servidor: 'está retornando erro de servidor',
  nao_encontrada: 'está retornando página não encontrada',
  lento: 'está lento (mais de 10s pra responder)',
}

async function sendPushToUser(userId: string, payload: { title: string; body: string; url: string; tag: string }) {
  const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('user_id', userId)
  if (!subs || subs.length === 0) return

  await Promise.all(
    subs.map(async (sub: { id: string; endpoint: string; p256dh: string; auth_key: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify({ title: payload.title, body: payload.body, icon: '/icon-192.png', url: payload.url, tag: payload.tag }),
        )
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number } | null)?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          console.error('[PUSH][sites] falha ao enviar:', err instanceof Error ? err.message : err)
        }
      }
    }),
  )
}

export async function notifySiteIssue(params: {
  userId: string
  siteName: string
  url: string
  status: 'fora_do_ar' | 'erro_servidor' | 'nao_encontrada' | 'lento'
  statusCode: number | null
  tempoMs: number | null
}) {
  try {
    if (!ensureVapidConfigured()) return
    const detalhe = params.statusCode ? ` (HTTP ${params.statusCode})` : ''
    await sendPushToUser(params.userId, {
      title: `⚠️ ${params.siteName} ${SITE_STATUS_LABELS[params.status]}`,
      body: `${params.url}${detalhe}`,
      url: '/sites',
      tag: `site-${params.url}`,
    })
  } catch (err) {
    console.error('[PUSH] notifySiteIssue falhou:', err)
  }
}

export async function notifySiteRecovered(params: { userId: string; siteName: string; url: string }) {
  try {
    if (!ensureVapidConfigured()) return
    await sendPushToUser(params.userId, {
      title: `✅ ${params.siteName} voltou ao ar`,
      body: params.url,
      url: '/sites',
      tag: `site-${params.url}`,
    })
  } catch (err) {
    console.error('[PUSH] notifySiteRecovered falhou:', err)
  }
}

export async function notifyCloakerIssue(params: { userId: string; siteName: string; url: string }) {
  try {
    if (!ensureVapidConfigured()) return
    await sendPushToUser(params.userId, {
      title: `🚨 Cloacker fora do ar — ${params.siteName}`,
      body: `${params.url}\nA página não está mostrando a versão black (marca escondida não encontrada).`,
      url: '/sites',
      tag: `cloaker-${params.url}`,
    })
  } catch (err) {
    console.error('[PUSH] notifyCloakerIssue falhou:', err)
  }
}

export async function notifyCloakerRecovered(params: { userId: string; siteName: string; url: string }) {
  try {
    if (!ensureVapidConfigured()) return
    await sendPushToUser(params.userId, {
      title: `✅ Cloacker voltou a funcionar — ${params.siteName}`,
      body: params.url,
      url: '/sites',
      tag: `cloaker-${params.url}`,
    })
  } catch (err) {
    console.error('[PUSH] notifyCloakerRecovered falhou:', err)
  }
}

export async function notifyCloudflareUsageWarning(params: {
  userId: string
  installationNome: string
  requests: number
  limit: number
}) {
  try {
    if (!ensureVapidConfigured()) return
    const percent = Math.round((params.requests / params.limit) * 100)
    await sendPushToUser(params.userId, {
      title: `⚠️ Rastreamento "${params.installationNome}" perto do limite`,
      body: `${params.requests.toLocaleString('pt-BR')} de ${params.limit.toLocaleString('pt-BR')} requisições hoje (${percent}%) no plano gratuito da Cloudflare.`,
      url: '/rastreamento',
      tag: `track-usage-${params.installationNome}`,
    })
  } catch (err) {
    console.error('[PUSH] notifyCloudflareUsageWarning falhou:', err)
  }
}
