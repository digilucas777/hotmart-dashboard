import type { Period, Venda, WidgetDataSource } from './types'

export function getPeriodRange(period: Period): { from: Date; to: Date } {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (period) {
    case 'today':
      return { from: todayStart, to: new Date(todayStart.getTime() + 86_400_000) }
    case 'yesterday': {
      const yd = new Date(todayStart.getTime() - 86_400_000)
      return { from: yd, to: todayStart }
    }
    case '7d':
      return {
        from: new Date(todayStart.getTime() - 6 * 86_400_000),
        to: new Date(todayStart.getTime() + 86_400_000),
      }
    case '30d':
      return {
        from: new Date(todayStart.getTime() - 29 * 86_400_000),
        to: new Date(todayStart.getTime() + 86_400_000),
      }
    case 'thisMonth': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: first, to: new Date(last.getTime() + 86_400_000) }
    }
    case 'lastMonth': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: first, to: new Date(last.getTime() + 86_400_000) }
    }
  }
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    approved: 'Aprovado',
    refunded: 'Reembolsado',
    cancelled: 'Cancelado',
    pending: 'Pendente',
  }
  return map[status] ?? status
}

export function normalizePagamento(method?: string | null): string {
  if (!method) return 'Outros'
  const m = method.toLowerCase()
  if (m.includes('pix')) return 'Pix'
  if (m.includes('credit') || m.includes('card') || m.includes('cartao') || m.includes('cartão') || m.includes('debit'))
    return 'Cartão'
  if (m.includes('billet') || m.includes('boleto') || m.includes('bank_slip')) return 'Boleto'
  return 'Outros'
}

export type ChartPoint = { label: string; valor: number; count: number }

export function buildChartData(vendas: Venda[], period: Period): ChartPoint[] {
  const approved = vendas.filter(v => v.status === 'approved')
  const { from, to } = getPeriodRange(period)

  if (period === 'today' || period === 'yesterday') {
    const buckets: Record<string, ChartPoint> = {}
    for (let h = 0; h < 24; h++) {
      const label = `${h.toString().padStart(2, '0')}h`
      buckets[label] = { label, valor: 0, count: 0 }
    }
    approved.forEach(v => {
      const d = new Date(v.data_venda)
      if (d >= from && d < to) {
        const label = `${d.getHours().toString().padStart(2, '0')}h`
        buckets[label].valor += v.valor
        buckets[label].count += 1
      }
    })
    return Object.values(buckets)
  }

  const days: ChartPoint[] = []
  let cursor = new Date(from)
  while (cursor < to) {
    const label = `${cursor.getDate().toString().padStart(2, '0')}/${(cursor.getMonth() + 1).toString().padStart(2, '0')}`
    days.push({ label, valor: 0, count: 0 })
    cursor = new Date(cursor.getTime() + 86_400_000)
  }

  approved.forEach(v => {
    const d = new Date(v.data_venda)
    if (d >= from && d < to) {
      const label = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
      const point = days.find(p => p.label === label)
      if (point) { point.valor += v.valor; point.count += 1 }
    }
  })

  return days
}

export type PiePoint = { name: string; value: number; color: string }

const PIE_COLORS: Record<string, string> = {
  Pix: '#22c55e', Cartão: '#6366f1', Boleto: '#f59e0b', Outros: '#64748b',
}

export function buildPieData(vendas: Venda[]): PiePoint[] {
  const approved = vendas.filter(v => v.status === 'approved')
  const groups: Record<string, number> = {}
  approved.forEach(v => {
    const key = normalizePagamento(v.forma_pagamento)
    groups[key] = (groups[key] ?? 0) + 1
  })
  return Object.entries(groups).map(([name, value]) => ({
    name, value, color: PIE_COLORS[name] ?? '#64748b',
  }))
}

// ---------- Widget data ----------

// SeriesPoint agora suporta valor único ou dois valores (BRL + USD)
export type SeriesPoint = { label: string; value: number; valueBRL?: number; valueUSD?: number }

export type WidgetComputedData =
  | { kind: 'metric'; value: string; subValue: string }
  | { kind: 'series'; points: SeriesPoint[]; dualCurrency?: boolean }
  | { kind: 'table'; vendas: Venda[] }

export function getValueFormat(source: WidgetDataSource): 'brl' | 'count' {
  const brlSources: WidgetDataSource[] = ['revenue_by_day', 'revenue_by_product']
  return brlSources.includes(source) ? 'brl' : 'count'
}

export function computeWidgetData(
  vendas: Venda[],
  dataSource: WidgetDataSource,
  period: Period,
  exchangeRate: number,
  custoTotal = 0,
): WidgetComputedData {
  const approved = vendas.filter(v => v.status === 'approved')
  const refunded = vendas.filter(v => v.status === 'refunded')
  const pending = vendas.filter(v => v.status === 'pending')
  const cancelled = vendas.filter(v => v.status === 'cancelled')

  const totalBRL = approved.filter(v => v.moeda === 'BRL').reduce((s, v) => s + (v.valor ?? 0), 0)
  const totalUSD = approved.filter(v => v.moeda === 'USD').reduce((s, v) => s + (v.valor ?? 0), 0)
  const totalConverted = totalBRL + totalUSD * exchangeRate
  const approvalRate = vendas.length > 0 ? (approved.length / vendas.length) * 100 : 0
  const avgTicket = approved.length > 0 ? totalConverted / approved.length : 0

  const sumConverted = (arr: Venda[]) =>
    arr.filter(v => v.moeda === 'BRL').reduce((s, v) => s + (v.valor ?? 0), 0) +
    arr.filter(v => v.moeda === 'USD').reduce((s, v) => s + (v.valor ?? 0), 0) * exchangeRate

  switch (dataSource) {
    case 'total_converted':
      return { kind: 'metric', value: formatBRL(totalConverted), subValue: `Taxa: R$ ${exchangeRate.toFixed(2)}/USD` }
    case 'total_brl':
      return { kind: 'metric', value: formatBRL(totalBRL), subValue: `${approved.filter(v => v.moeda === 'BRL').length} vendas em BRL` }
    case 'total_usd':
      return { kind: 'metric', value: formatUSD(totalUSD), subValue: `${approved.filter(v => v.moeda === 'USD').length} vendas em USD` }
    case 'sales_count':
      return { kind: 'metric', value: String(approved.length), subValue: `${approvalRate.toFixed(1)}% de aprovação` }
    case 'approval_rate':
      return { kind: 'metric', value: `${approvalRate.toFixed(1)}%`, subValue: `${approved.length} de ${vendas.length} vendas` }
    case 'avg_ticket':
      return { kind: 'metric', value: formatBRL(avgTicket), subValue: approved.length > 0 ? `${approved.length} aprovadas` : 'Sem vendas' }
    case 'refunds_count':
      return { kind: 'metric', value: String(refunded.length), subValue: refunded.length > 0 ? formatBRL(sumConverted(refunded)) : '—' }
    case 'pending_count':
      return { kind: 'metric', value: String(pending.length), subValue: pending.length > 0 ? formatBRL(sumConverted(pending)) : '—' }
    case 'cancelled_count':
      return { kind: 'metric', value: String(cancelled.length), subValue: cancelled.length > 0 ? formatBRL(sumConverted(cancelled)) : '—' }

    case 'lucro': {
      if (custoTotal <= 0) {
        return { kind: 'metric', value: formatBRL(totalConverted), subValue: 'Sem custo cadastrado' }
      }
      const lucro = totalConverted - custoTotal
      return {
        kind: 'metric',
        value: formatBRL(lucro),
        subValue: `Receita ${formatBRL(totalConverted)} — Custo ${formatBRL(custoTotal)}`,
      }
    }
    case 'margem_lucro': {
      if (custoTotal <= 0) {
        return { kind: 'metric', value: '—', subValue: 'Sem custo cadastrado' }
      }
      if (totalConverted <= 0) {
        return { kind: 'metric', value: '0,0%', subValue: 'Sem receita no período' }
      }
      const margem = ((totalConverted - custoTotal) / totalConverted) * 100
      return {
        kind: 'metric',
        value: `${margem.toFixed(1)}%`,
        subValue: `Lucro ${formatBRL(totalConverted - custoTotal)}`,
      }
    }
    case 'roas': {
      if (custoTotal <= 0) {
        return { kind: 'metric', value: '—', subValue: 'Sem custo cadastrado' }
      }
      const roas = custoTotal > 0 ? totalConverted / custoTotal : 0
      return {
        kind: 'metric',
        value: `${roas.toFixed(2)}x`,
        subValue: `R$ ${roas.toFixed(2)} por R$ 1 investido`,
      }
    }
    case 'cpa': {
      if (custoTotal <= 0) {
        return { kind: 'metric', value: '—', subValue: 'Sem custo cadastrado' }
      }
      if (approved.length === 0) {
        return { kind: 'metric', value: '—', subValue: 'Sem vendas aprovadas' }
      }
      return {
        kind: 'metric',
        value: formatBRL(custoTotal / approved.length),
        subValue: `${approved.length} vendas · custo ${formatBRL(custoTotal)}`,
      }
    }

    case 'revenue_by_day': {
      const { from, to } = getPeriodRange(period)
      const isHourly = period === 'today' || period === 'yesterday'

      // Monta buckets com BRL e USD separados
      const buckets: Record<string, { brl: number; usd: number }> = {}

      if (isHourly) {
        for (let h = 0; h < 24; h++) {
          const label = `${h.toString().padStart(2, '0')}h`
          buckets[label] = { brl: 0, usd: 0 }
        }
        approved.forEach(v => {
          const d = new Date(v.data_venda)
          if (d >= from && d < to) {
            const label = `${d.getHours().toString().padStart(2, '0')}h`
            if (v.moeda === 'BRL') buckets[label].brl += v.valor ?? 0
            else buckets[label].usd += v.valor ?? 0
          }
        })
      } else {
        let cursor = new Date(from)
        while (cursor < to) {
          const label = `${cursor.getDate().toString().padStart(2, '0')}/${(cursor.getMonth() + 1).toString().padStart(2, '0')}`
          buckets[label] = { brl: 0, usd: 0 }
          cursor = new Date(cursor.getTime() + 86_400_000)
        }
        approved.forEach(v => {
          const d = new Date(v.data_venda)
          if (d >= from && d < to) {
            const label = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
            if (buckets[label]) {
              if (v.moeda === 'BRL') buckets[label].brl += v.valor ?? 0
              else buckets[label].usd += v.valor ?? 0
            }
          }
        })
      }

      return {
        kind: 'series',
        dualCurrency: true,
        points: Object.entries(buckets).map(([label, { brl, usd }]) => ({
          label,
          value: brl + usd * exchangeRate, // convertido (fallback)
          valueBRL: brl,
          valueUSD: usd,
        })),
      }
    }

    case 'sales_by_day': {
      const base = buildChartData(vendas, period)
      return { kind: 'series', points: base.map(p => ({ label: p.label, value: p.count })) }
    }
    case 'revenue_by_product': {
      const groups: Record<string, number> = {}
      approved.forEach(v => {
        const val = v.moeda === 'USD' ? (v.valor ?? 0) * exchangeRate : (v.valor ?? 0)
        groups[v.produto] = (groups[v.produto] ?? 0) + val
      })
      return {
        kind: 'series',
        points: Object.entries(groups)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
      }
    }
    case 'count_by_product': {
      const groups: Record<string, number> = {}
      approved.forEach(v => { groups[v.produto] = (groups[v.produto] ?? 0) + 1 })
      return {
        kind: 'series',
        points: Object.entries(groups)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
      }
    }
    case 'by_payment': {
      const groups: Record<string, number> = {}
      approved.forEach(v => {
        const key = normalizePagamento(v.forma_pagamento)
        groups[key] = (groups[key] ?? 0) + 1
      })
      return {
        kind: 'series',
        points: Object.entries(groups).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      }
    }
    case 'by_country': {
      const groups: Record<string, number> = {}
      approved.forEach(v => {
        const key = v.pais ?? 'Desconhecido'
        groups[key] = (groups[key] ?? 0) + 1
      })
      return {
        kind: 'series',
        points: Object.entries(groups).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10),
      }
    }
    case 'by_status': {
      const statusMap: Record<string, string> = {
        approved: 'Aprovado', refunded: 'Reembolsado', cancelled: 'Cancelado', pending: 'Pendente',
      }
      const groups: Record<string, number> = {}
      vendas.forEach(v => {
        const key = statusMap[v.status] ?? v.status
        groups[key] = (groups[key] ?? 0) + 1
      })
      return {
        kind: 'series',
        points: Object.entries(groups).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      }
    }
    case 'transactions':
      return { kind: 'table', vendas }
  }
}