import { supabase } from './supabase'
import type { WidgetDataSource } from './types'

// Contrapartida em SQL de computeComparableMetric (lib/utils.ts) — usada só
// pra calcular a variação percentual "vs período anterior" dos widgets de
// métrica. Em vez de baixar todas as vendas do período anterior (26 colunas,
// paginado) só pra somar/contar em JS, o Postgres já devolve o agregado
// (no máx. ~14 linhas: 7 status x 2 moedas), do mesmo jeito pro período atual
// e pro anterior.
export type SummaryRow = { status: string; moeda: string; cnt: number; total: number }

export async function fetchVendasSummary(projetoId: string, from: Date, to: Date): Promise<SummaryRow[]> {
  const { data, error } = await supabase.rpc('get_vendas_summary', {
    p_projeto_id: projetoId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
  if (error) throw error
  return (data ?? []) as SummaryRow[]
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
