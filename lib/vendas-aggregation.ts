import { supabase } from './supabase'
import type { WidgetDataSource } from './types'
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
    let query = supabase.rpc('get_vendas_summary', {
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
  const { data, error } = await supabase.rpc('get_distinct_origens', { hotmart_ids: hotmartIds })
  if (error) throw error
  return ((data ?? []) as { origem: string }[]).map(r => r.origem)
}

export async function fetchDistinctAfiliados(hotmartIds: string[]): Promise<string[]> {
  if (hotmartIds.length === 0) return []
  const { data, error } = await supabase.rpc('get_distinct_afiliados', { hotmart_ids: hotmartIds })
  if (error) throw error
  return ((data ?? []) as { afiliado_nome: string }[]).map(r => r.afiliado_nome)
}
