import { supabase } from './supabase'
import type { WidgetDataSource, DiaRow } from './types'
import { formatBRL, formatUSD, type WidgetComputedData } from './utils'

// Contrapartida em SQL de computeComparableMetric (lib/utils.ts) — usada só
// pra calcular a variação percentual "vs período anterior" dos widgets de
// métrica. Em vez de baixar todas as vendas do período anterior (26 colunas,
// paginado) só pra somar/contar em JS, o Postgres já devolve o agregado
// (no máx. ~14 linhas: 7 status x 2 moedas), do mesmo jeito pro período atual
// e pro anterior.
export type SummaryRow = { status: string; moeda: string; cnt: number; total: number }

// Até 2 tentativas: contas com volume alto (milhares de vendas/mês) fazem
// essa agregação ocasionalmente estourar timeout/instabilidade passageira do
// Postgres, e sem retry isso vira o erro "Não foi possível carregar os dados
// de vendas" — a troca de período parece "travada no período antigo" porque
// summaryCurrent/summaryPrevious nunca chegam a ser atualizados quando a
// busca falha. Cancelamento intencional (troca de período/projeto no meio da
// busca) não deve virar retry, só erro de verdade.
export async function fetchVendasSummary(projetoId: string, from: Date, to: Date, signal?: AbortSignal): Promise<SummaryRow[]> {
  const maxAttempts = 2
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let query = supabase.rpc('get_vendas_summary_v2', {
      p_projeto_id: projetoId,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    })
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query
    if (!error) return (data ?? []) as SummaryRow[]
    if (signal?.aborted || attempt === maxAttempts) throw error
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  throw new Error('fetchVendasSummary: esgotou tentativas')
}

export type SummaryRowMulti = SummaryRow & { projeto_id: string }

// Versão pro combinado (multi-projeto): busca o resumo de todos os projetos do combo
// numa única chamada, em vez de uma chamada por projeto em paralelo. Isso reduz a
// exposição à contenção de CPU compartilhada (N consultas simultâneas viravam N chances
// de travar) e elimina o modo de falha onde um projeto sozinho engasgando fazia o
// faturamento total do combinado ficar silenciosamente menor que a soma real dos
// dashboards individuais — agora ou carrega tudo, ou falha tudo de forma visível.
export async function fetchVendasSummaryMulti(projetoIds: string[], from: Date, to: Date, signal?: AbortSignal): Promise<SummaryRowMulti[]> {
  if (projetoIds.length === 0) return []
  const maxAttempts = 2
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let query = supabase.rpc('get_vendas_summary_multi_v2', {
      p_projeto_ids: projetoIds,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    })
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query
    if (!error) return (data ?? []) as SummaryRowMulti[]
    if (signal?.aborted || attempt === maxAttempts) throw error
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  throw new Error('fetchVendasSummaryMulti: esgotou tentativas')
}

export async function fetchVendasPorDia(projetoId: string, from: Date, to: Date, signal?: AbortSignal): Promise<DiaRow[]> {
  const maxAttempts = 2
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let query = supabase.rpc('get_vendas_por_dia', {
      p_projeto_id: projetoId,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    })
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query
    if (!error) return (data ?? []) as DiaRow[]
    if (signal?.aborted || attempt === maxAttempts) throw error
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  throw new Error('fetchVendasPorDia: esgotou tentativas')
}

function sumWhere(rows: SummaryRow[], pred: (r: SummaryRow) => boolean): { cnt: number; total: number } {
  return rows.filter(pred).reduce((acc, r) => ({ cnt: acc.cnt + r.cnt, total: acc.total + r.total }), { cnt: 0, total: 0 })
}

// Mesma fórmula de computeComparableMetric, só que somando ~14 linhas agregadas
// em vez de escanear o array de vendas inteiro.
export function computeComparableFromSummary(
  summary: SummaryRow[],
  dataSource: WidgetDataSource,
  exchangeRate: number,
  custoTotal = 0,
  custoUSD = 0,
): number | null {
  const totalCount = summary.reduce((s, r) => s + r.cnt, 0)
  const approved = sumWhere(summary, r => r.status === 'approved')
  const approvedBRL = sumWhere(summary, r => r.status === 'approved' && r.moeda === 'BRL').total
  const approvedUSD = sumWhere(summary, r => r.status === 'approved' && r.moeda === 'USD').total
  const totalConverted = approvedBRL + approvedUSD * exchangeRate

  switch (dataSource) {
    case 'total_converted':
      return totalConverted
    case 'total_brl':
      return approvedBRL
    case 'total_usd':
      return approvedUSD
    case 'sales_count':
      return approved.cnt
    case 'approval_rate':
      return totalCount > 0 ? (approved.cnt / totalCount) * 100 : 0
    case 'refund_rate': {
      const descontosCnt = sumWhere(summary, r => r.status === 'refunded' || r.status === 'chargeback' || r.status === 'disputed').cnt
      return approved.cnt > 0 ? (descontosCnt / approved.cnt) * 100 : 0
    }
    case 'avg_ticket':
      return approved.cnt > 0 ? totalConverted / approved.cnt : 0
    case 'refunds_count':
      return sumWhere(summary, r => r.status === 'refunded').cnt
    case 'chargebacks_count':
      return sumWhere(summary, r => r.status === 'chargeback').cnt
    case 'disputed_count':
      return sumWhere(summary, r => r.status === 'disputed').cnt
    case 'pending_count':
      return sumWhere(summary, r => r.status === 'pending').cnt
    case 'cancelled_count':
      return sumWhere(summary, r => r.status === 'cancelled').cnt
    case 'lucro':
      return totalConverted - custoTotal
    case 'lucro_usd':
      return approvedUSD - custoUSD
    case 'margem_lucro':
      return totalConverted > 0 ? ((totalConverted - custoTotal) / totalConverted) * 100 : 0
    case 'roas':
      return custoTotal > 0 ? totalConverted / custoTotal : null
    case 'cpa':
      return custoTotal > 0 && approved.cnt > 0 ? custoTotal / approved.cnt : null
    case 'commission':
      return totalConverted * 0.18
    case 'comissao_33':
      return (totalConverted - custoTotal) * 0.33
    default:
      return null
  }
}

// Mesma fórmula dos casos `kind: 'metric'` de computeWidgetData (lib/utils.ts) — só que
// somando as ~14 linhas do resumo agregado em vez de escanear o array de vendas inteiro.
// É o que permite os cards de métrica renderizarem assim que get_vendas_summary chega,
// sem esperar a busca pesada de vendas cruas (paginada). Widgets fora dessa lista (gráficos,
// tabela) continuam usando computeWidgetData sobre o array bruto — retorna null pra eles.
export function computeWidgetDataFromSummary(
  summary: SummaryRow[],
  dataSource: WidgetDataSource,
  exchangeRate: number,
  custoTotal = 0,
  custoUSD = 0,
): WidgetComputedData | null {
  const totalCount = summary.reduce((s, r) => s + r.cnt, 0)
  const approved = sumWhere(summary, r => r.status === 'approved')
  const approvedBRL = sumWhere(summary, r => r.status === 'approved' && r.moeda === 'BRL').total
  const approvedUSD = sumWhere(summary, r => r.status === 'approved' && r.moeda === 'USD').total
  const totalConverted = approvedBRL + approvedUSD * exchangeRate
  const approvalRate = totalCount > 0 ? (approved.cnt / totalCount) * 100 : 0
  const avgTicket = approved.cnt > 0 ? totalConverted / approved.cnt : 0

  const sumConvertedStatus = (status: string) => {
    const s = sumWhere(summary, r => r.status === status)
    const brl = sumWhere(summary, r => r.status === status && r.moeda === 'BRL').total
    const usd = sumWhere(summary, r => r.status === status && r.moeda === 'USD').total
    return { cnt: s.cnt, converted: brl + usd * exchangeRate, brl, usd }
  }

  // Mesmo texto de computeWidgetData's sumByCurrencyLabel — mostra por moeda em vez de
  // converter tudo pra BRL (produtos majoritariamente em USD ficavam confusos convertidos).
  const sumByCurrencyLabel = (status: string) => {
    const { brl, usd } = sumConvertedStatus(status)
    const brlPart = brl > 0 ? `${formatBRL(brl)} BRL` : ''
    const usdPart = usd > 0 ? `${formatUSD(usd)} USD` : ''
    return [brlPart, usdPart].filter(Boolean).join(' + ')
  }

  switch (dataSource) {
    case 'total_converted':
      return { kind: 'metric', value: formatBRL(totalConverted), subValue: `Taxa: R$ ${exchangeRate.toFixed(2)}/USD` }
    case 'total_brl':
      return { kind: 'metric', value: formatBRL(approvedBRL), subValue: `${sumWhere(summary, r => r.status === 'approved' && r.moeda === 'BRL').cnt} vendas em BRL` }
    case 'total_usd':
      return { kind: 'metric', value: formatUSD(approvedUSD), subValue: `${sumWhere(summary, r => r.status === 'approved' && r.moeda === 'USD').cnt} vendas em USD` }
    case 'sales_count':
      return { kind: 'metric', value: String(approved.cnt), subValue: `${approvalRate.toFixed(1)}% de aprovação` }
    case 'approval_rate':
      return { kind: 'metric', value: `${approvalRate.toFixed(1)}%`, subValue: `${approved.cnt} de ${totalCount} vendas` }
    case 'refund_rate': {
      const descontosCnt = sumWhere(summary, r => r.status === 'refunded' || r.status === 'chargeback' || r.status === 'disputed').cnt
      const percent = approved.cnt > 0 ? (descontosCnt / approved.cnt) * 100 : 0
      return { kind: 'metric', value: `${percent.toFixed(1)}%`, subValue: `${descontosCnt} de ${approved.cnt} vendas aprovadas` }
    }
    case 'avg_ticket':
      return { kind: 'metric', value: formatBRL(avgTicket), subValue: approved.cnt > 0 ? `${approved.cnt} aprovadas` : 'Sem vendas' }
    case 'refunds_count': {
      const { cnt } = sumConvertedStatus('refunded')
      return { kind: 'metric', value: String(cnt), subValue: cnt > 0 ? sumByCurrencyLabel('refunded') : '—' }
    }
    case 'chargebacks_count': {
      const { cnt } = sumConvertedStatus('chargeback')
      return { kind: 'metric', value: String(cnt), subValue: cnt > 0 ? sumByCurrencyLabel('chargeback') : '—' }
    }
    case 'disputed_count': {
      const { cnt } = sumConvertedStatus('disputed')
      return { kind: 'metric', value: String(cnt), subValue: cnt > 0 ? sumByCurrencyLabel('disputed') : '—' }
    }
    case 'pending_count': {
      const { cnt, converted } = sumConvertedStatus('pending')
      return { kind: 'metric', value: String(cnt), subValue: cnt > 0 ? formatBRL(converted) : '—' }
    }
    case 'cancelled_count': {
      const { cnt, converted } = sumConvertedStatus('cancelled')
      return { kind: 'metric', value: String(cnt), subValue: cnt > 0 ? formatBRL(converted) : '—' }
    }
    case 'lucro': {
      if (custoTotal <= 0) return { kind: 'metric', value: formatBRL(totalConverted), subValue: 'Sem custo cadastrado', numericValue: totalConverted }
      const lucro = totalConverted - custoTotal
      return { kind: 'metric', value: formatBRL(lucro), subValue: `Receita ${formatBRL(totalConverted)} — Custo ${formatBRL(custoTotal)}`, numericValue: lucro }
    }
    case 'lucro_usd': {
      if (custoUSD <= 0) return { kind: 'metric', value: formatUSD(approvedUSD), subValue: 'Sem custo USD cadastrado', numericValue: approvedUSD }
      const lucroUSD = approvedUSD - custoUSD
      return { kind: 'metric', value: formatUSD(lucroUSD), subValue: `Receita ${formatUSD(approvedUSD)} — Custo ${formatUSD(custoUSD)}`, numericValue: lucroUSD }
    }
    case 'margem_lucro': {
      if (custoTotal <= 0) return { kind: 'metric', value: '—', subValue: 'Sem custo cadastrado' }
      if (totalConverted <= 0) return { kind: 'metric', value: '0,0%', subValue: 'Sem receita no período' }
      const margem = ((totalConverted - custoTotal) / totalConverted) * 100
      return { kind: 'metric', value: `${margem.toFixed(1)}%`, subValue: `Lucro ${formatBRL(totalConverted - custoTotal)}` }
    }
    case 'roas': {
      if (custoTotal <= 0) return { kind: 'metric', value: '—', subValue: 'Sem custo cadastrado' }
      const roas = totalConverted / custoTotal
      return { kind: 'metric', value: `${roas.toFixed(2)}x`, subValue: `R$ ${roas.toFixed(2)} por R$ 1 investido` }
    }
    case 'cpa': {
      if (custoTotal <= 0) return { kind: 'metric', value: '—', subValue: 'Sem custo cadastrado' }
      if (approved.cnt === 0) return { kind: 'metric', value: '—', subValue: 'Sem vendas aprovadas' }
      return { kind: 'metric', value: formatBRL(custoTotal / approved.cnt), subValue: `${approved.cnt} vendas · custo ${formatBRL(custoTotal)}` }
    }
    case 'commission': {
      const commission = totalConverted * 0.18
      return { kind: 'metric', value: formatBRL(commission), subValue: `18% de ${formatBRL(totalConverted)}` }
    }
    case 'comissao_33': {
      const comissao = (totalConverted - custoTotal) * 0.33
      const comissaoUSD = exchangeRate > 0 ? comissao / exchangeRate : 0
      return { kind: 'metric', value: formatBRL(comissao), subValue: formatUSD(comissaoUSD), numericValue: comissao }
    }
    default:
      return null
  }
}

export async function fetchDistinctOrigens(hotmartIds: string[]): Promise<string[]> {
  if (hotmartIds.length === 0) return []
  const { data, error } = await supabase.rpc('get_distinct_origens_v2', { hotmart_ids: hotmartIds })
  if (error) throw error
  return ((data ?? []) as { origem: string }[]).map(r => r.origem)
}

export async function fetchDistinctAfiliados(hotmartIds: string[]): Promise<string[]> {
  if (hotmartIds.length === 0) return []
  const { data, error } = await supabase.rpc('get_distinct_afiliados_v2', { hotmart_ids: hotmartIds })
  if (error) throw error
  return ((data ?? []) as { afiliado_nome: string }[]).map(r => r.afiliado_nome)
}

// Mesma lógica em 2 etapas já usada em app/vendas/page.tsx pra escopar vendas
// por projeto (projeto_produtos -> produtos.hotmart_id), extraída aqui pra
// reaproveitar na tela de dashboards combinados sem duplicar a consulta.
export async function fetchHotmartIdsForProjetos(projetoIds: string[]): Promise<string[]> {
  if (projetoIds.length === 0) return []
  const { data: pp, error: ppError } = await supabase
    .from('projeto_produtos')
    .select('produto_id')
    .in('projeto_id', projetoIds)
  if (ppError) throw ppError

  const produtoIds = Array.from(new Set((pp ?? []).map((r: { produto_id: string }) => r.produto_id)))
  if (produtoIds.length === 0) return []

  const { data: prods, error: prodsError } = await supabase
    .from('produtos')
    .select('hotmart_id')
    .in('id', produtoIds)
  if (prodsError) throw prodsError

  return (prods ?? []).map((r: { hotmart_id: string }) => r.hotmart_id)
}

export type OfferAllowlist = {
  productIdByHotmartId: Map<string, string>
  allOfferProducts: Set<string>
  allowedOffersByProduct: Record<string, Set<string>>
}

// Mesmos arrays/cutoff da função SQL refresh_vendas_resumo_diario_by_hotmart_id
// (fonte de verdade) — replicados aqui pra reconstruir, em JS, o MESMO sufixo
// virtual que o resumo pré-calculado grava, inclusive os dois casos que não
// dependem de origem (conversão ®/full-rec e corte de assinatura por data).
const BORDELESS_FULL_REC_IDS = new Set([
  '8294393', '8291627', '8356204', '8356156', '8291970', '8292135', '8294223', '8293904', '8356130', '4855438',
])
const ASSINATURA_POS_IDS = new Set(['7468175', '8293571', '7360080', '8275411', '7313804'])
const TRAFEGO_ES_IDS = new Set([
  '4804098', '4804186', '4804654', '8294393', '5085309', '7311693', '7359983', '4802964', '8291627', '4803869',
  '4821899', '8356204', '6101329', '7052581', '563191', '4804539', '4804737', '8356156', '5669621', '8291970',
  '7010960', '4804439', '8292135', '7052625', '8293571', '7360080', '8294223', '4855438', '5608576', '8293904',
  '6101509', '6101720', '6264821', '7312372', '8356130', '7222835',
])
const POS_CUTOFF = '2026-10-16'

// Converte um timestamp de venda (UTC) pra data local de Brasília (UTC-3 fixo,
// Brasil não observa DST desde 2019) — mesma conversão que o SQL faz com
// `at time zone 'America/Sao_Paulo'`, necessária pra comparar com POS_CUTOFF.
function dataVendaBrasilia(dataVenda: string | null | undefined): string | null {
  if (!dataVenda) return null
  const d = new Date(new Date(dataVenda).getTime() - 3 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

// Mesma origem-vira-sufixo das migrations 084/086/090/090b ("Produtos com split
// por origem, conversão ®/full-rec, ou corte de assinatura por data gravam a
// oferta real + sufixo __app/__rec/__pos1016 só no resumo pré-calculado,
// vendas.oferta_codigo nunca tem o sufixo") — reconstrói o sufixo a partir de
// hotmart_produto_id/origem/data_venda pra poder comparar com os registros de
// projeto_produto_ofertas. Precisa espelhar EXATAMENTE a ordem de checagem da
// função SQL, senão um produto cai no ramo errado (ex: um bordeless ® também
// está na lista de ES, mas o corte full-rec tem que vencer, incondicional).
function virtualOfferSuffix(hotmartProdutoId: string | null | undefined, origem: string | null | undefined, dataVenda: string | null | undefined): string {
  const produtoId = hotmartProdutoId ?? ''
  const o = (origem ?? '').toLowerCase()
  const dataLocal = dataVendaBrasilia(dataVenda)
  const posVencido = dataLocal !== null && dataLocal >= POS_CUTOFF

  if (produtoId === '7744143' && o === 'app') return '__app'
  if (BORDELESS_FULL_REC_IDS.has(produtoId) && posVencido) return '__rec'
  if (TRAFEGO_ES_IDS.has(produtoId)) {
    if (o.startsWith('rec') || o.startsWith('upsell') || o.startsWith('renov') || o.includes('recusada')) return '__rec'
    if (o === 'app' || o.startsWith('bannerapp') || o === 'hotmart_site_app') return '__app'
    if (ASSINATURA_POS_IDS.has(produtoId) && posVencido) return '__pos1016'
    return ''
  }
  if (ASSINATURA_POS_IDS.has(produtoId) && posVencido) return '__pos1016'
  return ''
}

// Busca a config de produtos/ofertas de um ou mais projetos (união, pra combinados:
// um produto+oferta conta se QUALQUER projeto do grupo o liberar) e monta a allowlist
// usada por filterVendasByOfferAllowlist. Extraída pra ser compartilhada entre o
// dashboard individual e a tela de combinado — antes só o individual filtrava vendas
// cruas (tabela/gráficos) por oferta/origem; o combinado mostrava qualquer venda de
// qualquer produto vinculado, inclusive recuperação/app que não deveriam contar ali.
export async function fetchOfferAllowlistForProjetos(projetoIds: string[]): Promise<OfferAllowlist> {
  if (projetoIds.length === 0) {
    return { productIdByHotmartId: new Map(), allOfferProducts: new Set(), allowedOffersByProduct: {} }
  }
  const { data: pp, error: ppError } = await supabase
    .from('projeto_produtos')
    .select('produto_id, todas_ofertas')
    .in('projeto_id', projetoIds)
  if (ppError) throw ppError
  const productLinks = (pp ?? []) as { produto_id: string; todas_ofertas?: boolean | null }[]
  const produtoIds = Array.from(new Set(productLinks.map(r => r.produto_id)))
  if (produtoIds.length === 0) {
    return { productIdByHotmartId: new Map(), allOfferProducts: new Set(), allowedOffersByProduct: {} }
  }

  const [prodsRes, offersRes] = await Promise.all([
    supabase.from('produtos').select('id, hotmart_id').in('id', produtoIds),
    supabase.from('projeto_produto_ofertas').select('produto_id, oferta_codigo').in('projeto_id', projetoIds),
  ])
  if (prodsRes.error) throw prodsRes.error
  if (offersRes.error) throw offersRes.error

  const products = (prodsRes.data ?? []) as { id: string; hotmart_id: string }[]
  const offerLinks = (offersRes.data ?? []) as { produto_id: string; oferta_codigo: string }[]

  const productIdByHotmartId = new Map(products.map(p => [p.hotmart_id, p.id]))
  const allOfferProducts = new Set(
    productLinks.filter(link => link.todas_ofertas !== false).map(link => link.produto_id),
  )
  const allowedOffersByProduct = offerLinks.reduce((acc, link) => {
    if (!acc[link.produto_id]) acc[link.produto_id] = new Set<string>()
    acc[link.produto_id]!.add(link.oferta_codigo)
    return acc
  }, {} as Record<string, Set<string>>)

  return { productIdByHotmartId, allOfferProducts, allowedOffersByProduct }
}

// Mesma regra do filterRowsByOfferSelection do dashboard individual: quando a
// origem indica recuperação/app, a venda só conta se o código SUFIXADO estiver
// liberado — não basta o código puro estar liberado, senão uma venda de
// recuperação aparece na tabela/gráfico de um projeto/combinado de tráfego só
// porque o produto+oferta "crus" também pertencem a ele.
export function filterVendasByOfferAllowlist<T extends { hotmart_produto_id?: string | null; oferta_codigo?: string | null; origem?: string | null; data_venda?: string | null }>(
  rows: T[],
  allowlist: OfferAllowlist,
): T[] {
  return rows.filter(venda => {
    const productId = venda.hotmart_produto_id ? allowlist.productIdByHotmartId.get(venda.hotmart_produto_id) : undefined
    if (!productId) return false
    const realCode = venda.oferta_codigo ?? ''
    const suffix = virtualOfferSuffix(venda.hotmart_produto_id, venda.origem, venda.data_venda)
    // Quando o produto cai num bucket virtual (recuperação/app/corte de assinatura), o
    // atalho de todas_ofertas NÃO vale — senão um produto com todas_ofertas=true (ex: um
    // bordeless ® ainda vinculado ao projeto de tráfego) continua aparecendo nas vendas
    // cruas mesmo depois de convertido pra só-recuperação. Só o código SUFIXADO liberado
    // explicitamente em projeto_produto_ofertas conta pra esse bucket.
    if (suffix) {
      const allowedOffers = allowlist.allowedOffersByProduct[productId]
      return !!allowedOffers?.has(realCode + suffix)
    }
    if (allowlist.allOfferProducts.has(productId)) return true
    const allowedOffers = allowlist.allowedOffersByProduct[productId]
    if (!allowedOffers || allowedOffers.size === 0) return false
    return allowedOffers.has(realCode)
  })
}
