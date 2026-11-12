// Gráficos e tabela de transações sem baixar todas as vendas cruas (migrations 120-122).
// Antes o navegador paginava TODAS as vendas do período (49 mil no período máximo do
// tráfego do Pedro, ~50 lotes) pra montar os gráficos e a tabela. Agora:
//  - get_vendas_graficos: o banco devolve os gráficos já somados (dia/produto/país/
//    pagamento/status), com o mesmo filtro de ofertas/origem/afiliado da tela;
//  - get_vendas_tabela: a tabela vem 250 por vez, com botão "carregar mais".
// Períodos por hora (hoje/ontem/1 dia) continuam com as vendas cruas: são poucas.
import { supabase } from '@/lib/supabase'
import type { Period, Venda, WidgetDataSource } from '@/lib/types'
import { getPeriodRange, normalizePagamento, type WidgetComputedData } from '@/lib/utils'

export type GraficoRow = { tipo: 'dia' | 'produto' | 'pais' | 'pagamento' | 'status'; chave: string | null; moeda: string | null; cnt: number; total: number }

export const TABELA_POR_VEZ = 250

// Mesma regra de "gráfico por hora" do computeWidgetData (lib/utils.ts).
export function isPeriodoPorHora(period: Period, customRange?: { from: Date; to: Date }) {
  return period === 'today' || period === 'yesterday' ||
    (period === 'custom' && !!customRange && customRange.to.getTime() - customRange.from.getTime() <= 86_400_000)
}

// Fontes de widget que antes dependiam do array inteiro de vendas cruas.
export const FONTES_GRAFICO: WidgetDataSource[] = [
  'revenue_by_day', 'sales_by_day', 'revenue_by_product', 'count_by_product', 'by_payment', 'by_country', 'by_status',
]

const filtros = (origens: string[], afiliados: string[]) => ({
  p_origens: origens.length > 0 ? origens : null,
  p_afiliados: afiliados.length > 0 ? afiliados : null,
})

export async function fetchGraficos(
  projetoId: string, from: Date, to: Date, origens: string[], afiliados: string[], signal?: AbortSignal,
): Promise<GraficoRow[]> {
  let q = supabase.rpc('get_vendas_graficos', {
    p_projeto_id: projetoId, p_from: from.toISOString(), p_to: to.toISOString(), ...filtros(origens, afiliados),
  })
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q
  if (error) throw error
  return ((data ?? []) as GraficoRow[]).map(r => ({ ...r, cnt: Number(r.cnt), total: Number(r.total) }))
}

export async function fetchTabela(
  projetoId: string, from: Date, to: Date, origens: string[], afiliados: string[], columns: string,
  cursor: { data: string; id: string } | null, signal?: AbortSignal,
): Promise<Venda[]> {
  let q = supabase.rpc('get_vendas_tabela', {
    p_projeto_id: projetoId, p_from: from.toISOString(), p_to: to.toISOString(), ...filtros(origens, afiliados),
    p_limit: TABELA_POR_VEZ, p_cursor_data: cursor?.data ?? null, p_cursor_id: cursor?.id ?? null,
  }).select(columns)
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as Venda[]
}

// Total de vendas do período (todas as situações), pra mostrar "X de Y" na tabela.
export function totalVendasDosGraficos(rows: GraficoRow[]) {
  return rows.filter(r => r.tipo === 'status').reduce((s, r) => s + r.cnt, 0)
}

// Ranking de países e top produto (cards laterais do DashboardClient), em BRL convertido.
export function rankingPaisesDosGraficos(rows: GraficoRow[], exchangeRate: number) {
  const groups = new Map<string, { label: string; count: number; revenue: number }>()
  for (const r of rows) {
    if (r.tipo !== 'pais') continue
    const code = (r.chave || '').trim().toUpperCase()
    const label = code ? code : 'Unknown'
    const current = groups.get(label) ?? { label, count: 0, revenue: 0 }
    current.count += r.cnt
    current.revenue += r.moeda === 'USD' ? r.total * exchangeRate : r.total
    groups.set(label, current)
  }
  return Array.from(groups.values()).sort((a, b) => b.revenue - a.revenue)
}

export function resumoAprovadasDosGraficos(rows: GraficoRow[], exchangeRate: number) {
  let aprovadas = 0
  let totalBRL = 0
  const porProduto: Record<string, number> = {}
  for (const r of rows) {
    if (r.tipo === 'dia') {
      aprovadas += r.cnt
      totalBRL += r.moeda === 'BRL' ? r.total : r.total * exchangeRate
    }
    if (r.tipo === 'produto') {
      const key = r.chave || 'Produto'
      porProduto[key] = (porProduto[key] ?? 0) + (r.moeda === 'USD' ? r.total * exchangeRate : r.total)
    }
  }
  const topProduto = Object.entries(porProduto).sort((a, b) => b[1] - a[1])[0]?.[0]
  return { aprovadas, totalBRL, topProduto }
}

// Mesmo resultado de computeWidgetData (lib/utils.ts) pras fontes de gráfico, só que a
// partir das somas do banco. Períodos por hora não passam aqui (ficam com vendas cruas).
export function computeWidgetDataFromGraficos(
  rows: GraficoRow[],
  dataSource: WidgetDataSource,
  period: Period,
  exchangeRate: number,
  customRange?: { from: Date; to: Date },
): WidgetComputedData | null {
  const labelDia = (d: Date) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
  const diasDoPeriodo = () => {
    const { from, to } = getPeriodRange(period, customRange)
    const labels: string[] = []
    let cursor = new Date(from)
    while (cursor < to) {
      labels.push(labelDia(cursor))
      cursor = new Date(cursor.getTime() + 86_400_000)
    }
    return labels
  }
  const labelDaChave = (chave: string | null) => {
    const [, m, d] = (chave ?? '').split('-')
    return `${d}/${m}`
  }

  switch (dataSource) {
    case 'revenue_by_day': {
      const buckets: Record<string, { brl: number; usd: number }> = {}
      for (const l of diasDoPeriodo()) buckets[l] = { brl: 0, usd: 0 }
      for (const r of rows) {
        if (r.tipo !== 'dia') continue
        const b = buckets[labelDaChave(r.chave)]
        if (!b) continue
        if (r.moeda === 'BRL') b.brl += r.total
        else b.usd += r.total
      }
      return {
        kind: 'series',
        dualCurrency: true,
        points: Object.entries(buckets).map(([label, { brl, usd }]) => ({ label, value: brl + usd * exchangeRate, valueBRL: brl, valueUSD: usd })),
      }
    }
    case 'sales_by_day': {
      const buckets: Record<string, number> = {}
      for (const l of diasDoPeriodo()) buckets[l] = 0
      for (const r of rows) {
        if (r.tipo !== 'dia') continue
        const l = labelDaChave(r.chave)
        if (l in buckets) buckets[l] += r.cnt
      }
      return { kind: 'series', points: Object.entries(buckets).map(([label, value]) => ({ label, value })) }
    }
    case 'revenue_by_product': {
      const groups: Record<string, { label: string; value: number; valueBRL: number; currency: string; count: number }> = {}
      for (const r of rows) {
        if (r.tipo !== 'produto') continue
        const currency = r.moeda === 'USD' ? 'USD' : 'BRL'
        const label = r.chave || 'Produto'
        const key = `${label}__${currency}`
        const g = groups[key] ?? { label, value: 0, valueBRL: 0, currency, count: 0 }
        g.value += r.total
        g.valueBRL += currency === 'USD' ? r.total * exchangeRate : r.total
        g.count += r.cnt
        groups[key] = g
      }
      return { kind: 'series', points: Object.values(groups).sort((a, b) => b.valueBRL - a.valueBRL).slice(0, 10) }
    }
    case 'count_by_product': {
      const groups: Record<string, number> = {}
      for (const r of rows) {
        if (r.tipo !== 'produto') continue
        const label = r.chave ?? ''
        groups[label] = (groups[label] ?? 0) + r.cnt
      }
      return {
        kind: 'series',
        points: Object.entries(groups).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10),
      }
    }
    case 'by_payment': {
      const groups: Record<string, number> = {}
      for (const r of rows) {
        if (r.tipo !== 'pagamento') continue
        const key = normalizePagamento(r.chave)
        groups[key] = (groups[key] ?? 0) + r.cnt
      }
      return { kind: 'series', points: Object.entries(groups).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) }
    }
    case 'by_country': {
      const groups: Record<string, { count: number; revenue: number }> = {}
      for (const r of rows) {
        if (r.tipo !== 'pais') continue
        const key = r.chave ?? 'Desconhecido'
        const g = groups[key] ?? { count: 0, revenue: 0 }
        g.count += r.cnt
        g.revenue += r.total * (r.moeda === 'USD' ? exchangeRate : 1)
        groups[key] = g
      }
      return {
        kind: 'series',
        points: Object.entries(groups).map(([label, g]) => ({ label, value: g.count, valueBRL: g.revenue })).sort((a, b) => b.value - a.value).slice(0, 10),
      }
    }
    case 'by_status': {
      const statusMap: Record<string, string> = {
        approved: 'Aprovado', refunded: 'Reembolsado', cancelled: 'Cancelado', pending: 'Pendente', abandoned: 'Abandono', chargeback: 'Chargeback', disputed: 'Reclamado',
      }
      const groups: Record<string, number> = {}
      for (const r of rows) {
        if (r.tipo !== 'status') continue
        const key = statusMap[r.chave ?? ''] ?? (r.chave ?? '')
        groups[key] = (groups[key] ?? 0) + r.cnt
      }
      return { kind: 'series', points: Object.entries(groups).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) }
    }
    default:
      return null
  }
}
