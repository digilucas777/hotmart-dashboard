import type { Period, Venda, WidgetDataSource, Status } from './types'

export function getPeriodRange(period: Period, customRange?: { from: Date; to: Date }): { from: Date; to: Date } {
  if (period === 'custom') {
    if (customRange) return customRange
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return { from: todayStart, to: new Date(todayStart.getTime() + 86_400_000) }
  }
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = 86_400_000
  const weekStart = new Date(todayStart)
  weekStart.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7))

  switch (period) {
    case 'today':
      return { from: todayStart, to: new Date(todayStart.getTime() + day) }
    case 'yesterday': {
      const yd = new Date(todayStart.getTime() - day)
      return { from: yd, to: todayStart }
    }
    case 'thisWeek':
      return { from: weekStart, to: new Date(todayStart.getTime() + day) }
    case 'lastWeek':
      return { from: new Date(weekStart.getTime() - 7 * day), to: weekStart }
    case 'thisMonth': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: first, to: new Date(todayStart.getTime() + day) }
    }
    case 'lastMonth': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: first, to: new Date(last.getTime() + 86_400_000) }
    }
  }
}

export function getPreviousPeriodRange(period: Period, customRange?: { from: Date; to: Date }): { from: Date; to: Date } {
  const current = getPeriodRange(period, customRange)
  const duration = current.to.getTime() - current.from.getTime()
  return { from: new Date(current.from.getTime() - duration), to: current.from }
}

export function formatShortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatPeriodContext(period: Period, customRange?: { from: Date; to: Date }): string {
  const { from, to } = getPeriodRange(period, customRange)
  const inclusiveTo = new Date(to.getTime() - 1)
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
  const labels: Record<Period, string> = {
    today: `Hoje • ${formatShortDate(from)}/${from.getFullYear()}`,
    yesterday: `Ontem • ${formatShortDate(from)}/${from.getFullYear()}`,
    thisWeek: `Esta semana • ${formatShortDate(from)} -> ${formatShortDate(inclusiveTo)}`,
    lastWeek: `Semana passada • ${formatShortDate(from)} -> ${formatShortDate(inclusiveTo)}`,
    thisMonth: `Este mês • ${monthName.format(from)}`,
    lastMonth: `Último mês • ${monthName.format(from)}`,
    custom: `Personalizado • ${formatShortDate(from)} -> ${formatShortDate(inclusiveTo)}`,
  }
  return labels[period]
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return 'sem vendas ainda'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `há ${seconds} segundo${seconds === 1 ? '' : 's'}`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  return `há ${days} dia${days === 1 ? '' : 's'}`
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
    abandoned: 'Abandono',
  }
  return map[status] ?? status
}

export function parseOrigem(raw?: string | null): string {
  if (!raw) return '—'
  try {
    const obj = JSON.parse(raw)
    if (typeof obj === 'object' && obj !== null) {
      if (obj.src) return String(obj.src)
      if (obj.sck !== undefined) return 'sck'
      const firstStr = Object.values(obj).find(v => typeof v === 'string')
      if (firstStr) return String(firstStr)
    }
  } catch {
    // not JSON
  }
  return raw
}

export function normalizePagamento(method?: string | null): string {
  if (!method) return 'Outros'
  const m = method.toUpperCase()
  if (m.includes('PAYPAL')) return 'PayPal'
  if (m.includes('APPLE_PAY') || m.includes('APPLEPAY')) return 'Apple Pay'
  if (m.includes('YAPE')) return 'Yape'
  if (m.includes('OXXO')) return 'Oxxo'
  if (m.includes('PIX')) return 'Pix'
  if (m.includes('VISA')) return 'Visa'
  if (m.includes('MASTERCARD') || m.includes('MASTER_CARD')) return 'Mastercard'
  if (m.includes('AMEX') || m.includes('AMERICAN_EXPRESS')) return 'Amex'
  if (m.includes('BOLETO') || m.includes('BILLET') || m.includes('BANK_SLIP')) return 'Boleto'
  if (m.includes('CREDIT') || m.includes('CARD') || m.includes('CARTAO') || m.includes('CARTÃO') || m.includes('DEBIT'))
    return 'Cartão'
  return 'Outros'
}

export type ChartPoint = { label: string; valor: number; count: number }

export function buildChartData(vendas: Venda[], period: Period, customRange?: { from: Date; to: Date }): ChartPoint[] {
  const approved = vendas.filter(v => v.status === 'approved')
  const { from, to } = getPeriodRange(period, customRange)
  const isHourly = period === 'today' || period === 'yesterday' ||
    (period === 'custom' && !!customRange && customRange.to.getTime() - customRange.from.getTime() <= 86_400_000)

  if (isHourly) {
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
  Pix: '#22c55e',
  Cartão: '#6366f1',
  Boleto: '#f59e0b',
  PayPal: '#3b82f6',
  Visa: '#1d4ed8',
  Mastercard: '#dc2626',
  Amex: '#0ea5e9',
  'Apple Pay': '#64748b',
  Yape: '#7c3aed',
  Oxxo: '#ea580c',
  Outros: '#475569',
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

export type SeriesPoint = { label: string; value: number; valueBRL?: number; valueUSD?: number }

export type CombinedPoint = {
  label: string
  valueBRL: number
  valueUSD: number
  approved: number
  reembolsos: number
}

export type WidgetComputedData =
  | { kind: 'metric'; value: string; subValue: string }
  | { kind: 'series'; points: SeriesPoint[]; dualCurrency?: boolean }
  | { kind: 'table'; vendas: Venda[] }
  | { kind: 'combined'; points: CombinedPoint[] }

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
  customRange?: { from: Date; to: Date },
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
    case 'commission': {
      const commission = totalConverted * 0.18
      return {
        kind: 'metric',
        value: formatBRL(commission),
        subValue: `18% de ${formatBRL(totalConverted)}`,
      }
    }

    case 'revenue_by_day': {
      const { from, to } = getPeriodRange(period, customRange)
      const isHourly = period === 'today' || period === 'yesterday' ||
        (period === 'custom' && !!customRange && customRange.to.getTime() - customRange.from.getTime() <= 86_400_000)

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
          value: brl + usd * exchangeRate,
          valueBRL: brl,
          valueUSD: usd,
        })),
      }
    }

    case 'sales_by_day': {
      const base = buildChartData(vendas, period, customRange)
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
        approved: 'Aprovado', refunded: 'Reembolsado', cancelled: 'Cancelado', pending: 'Pendente', abandoned: 'Abandono',
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

    case 'combined_by_day': {
      const { from, to } = getPeriodRange(period, customRange)
      const isHourly = period === 'today' || period === 'yesterday' ||
        (period === 'custom' && !!customRange && customRange.to.getTime() - customRange.from.getTime() <= 86_400_000)
      const buckets: Record<string, CombinedPoint> = {}

      if (isHourly) {
        for (let h = 0; h < 24; h++) {
          const label = `${h.toString().padStart(2, '0')}h`
          buckets[label] = { label, valueBRL: 0, valueUSD: 0, approved: 0, reembolsos: 0 }
        }
      } else {
        let cursor = new Date(from)
        while (cursor < to) {
          const label = `${cursor.getDate().toString().padStart(2, '0')}/${(cursor.getMonth() + 1).toString().padStart(2, '0')}`
          buckets[label] = { label, valueBRL: 0, valueUSD: 0, approved: 0, reembolsos: 0 }
          cursor = new Date(cursor.getTime() + 86_400_000)
        }
      }

      vendas.forEach(v => {
        const d = new Date(v.data_venda)
        if (d < from || d >= to) return
        const label = isHourly
          ? `${d.getHours().toString().padStart(2, '0')}h`
          : `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`
        if (!buckets[label]) return
        if (v.status === 'approved') {
          buckets[label].approved += 1
          if (v.moeda === 'BRL') buckets[label].valueBRL += v.valor ?? 0
          else buckets[label].valueUSD += v.valor ?? 0
        } else if (v.status === 'refunded') {
          buckets[label].reembolsos += 1
        }
      })

      return { kind: 'combined', points: Object.values(buckets) }
    }
    default:
      return { kind: 'metric', value: '—', subValue: '' }
  }
}

export function computeComparableMetric(
  vendas: Venda[],
  dataSource: WidgetDataSource,
  exchangeRate: number,
  custoTotal = 0,
): number | null {
  const approved = vendas.filter(v => v.status === 'approved')
  const sumConverted = (arr: Venda[]) =>
    arr.reduce((sum, v) => sum + (v.moeda === 'USD' ? (v.valor ?? 0) * exchangeRate : (v.valor ?? 0)), 0)
  const totalConverted = sumConverted(approved)
  const totalBRL = approved.filter(v => v.moeda === 'BRL').reduce((s, v) => s + (v.valor ?? 0), 0)
  const totalUSD = approved.filter(v => v.moeda === 'USD').reduce((s, v) => s + (v.valor ?? 0), 0)
  switch (dataSource) {
    case 'total_converted':
      return totalConverted
    case 'total_brl':
      return totalBRL
    case 'total_usd':
      return totalUSD
    case 'sales_count':
      return approved.length
    case 'approval_rate':
      return vendas.length > 0 ? (approved.length / vendas.length) * 100 : 0
    case 'avg_ticket':
      return approved.length > 0 ? totalConverted / approved.length : 0
    case 'refunds_count':
      return vendas.filter(v => v.status === 'refunded').length
    case 'pending_count':
      return vendas.filter(v => v.status === 'pending').length
    case 'cancelled_count':
      return vendas.filter(v => v.status === 'cancelled').length
    case 'lucro':
      return totalConverted - custoTotal
    case 'margem_lucro':
      return totalConverted > 0 ? ((totalConverted - custoTotal) / totalConverted) * 100 : 0
    case 'roas':
      return custoTotal > 0 ? totalConverted / custoTotal : null
    case 'cpa':
      return custoTotal > 0 && approved.length > 0 ? custoTotal / approved.length : null
    case 'commission':
      return totalConverted * 0.18
    default:
      return null
  }
}

export function formatPeriodComparisonLabel(period: Period): string {
  const labels: Record<Period, string> = {
    today: 'ontem',
    yesterday: 'dia anterior',
    thisWeek: 'semana passada',
    lastWeek: 'semana anterior',
    thisMonth: 'mês anterior',
    lastMonth: 'mês anterior',
    custom: 'período anterior',
  }
  return labels[period]
}

const DEMO_PRODUTOS = ['Método Acelerador Digital', 'Mentoria Premium 2.0', 'Curso Tráfego Pro']
const DEMO_NOMES = ['Lucas Mendes', 'Ana Costa', 'Pedro Oliveira', 'Maria Santos', 'João Ferreira', 'Carla Lima', 'Rafael Souza', 'Juliana Rocha']
const DEMO_PAGAMENTOS = ['CREDIT_CARD', 'CREDIT_CARD', 'PIX', 'PIX', 'CREDIT_CARD', 'BOLETO']
const DEMO_PAISES = ['BR', 'BR', 'BR', 'BR', 'PT', 'BR']
const DEMO_STATUS_WEIGHTS: [Status, number][] = [['approved', 72], ['pending', 12], ['cancelled', 8], ['refunded', 5], ['abandoned', 3]]

function demoPick<T>(arr: T[], seed: number): T { return arr[Math.abs(seed) % arr.length]! }
function demoStatus(seed: number): Status {
  const h = Math.abs(seed) % 100
  let acc = 0
  for (const [s, w] of DEMO_STATUS_WEIGHTS) { acc += w; if (h < acc) return s }
  return 'approved'
}

export function generateDemoVendas(period: Period, customRange?: { from: Date; to: Date }): Venda[] {
  const { from, to } = getPeriodRange(period, customRange)
  const durationMs = to.getTime() - from.getTime()
  const days = Math.max(1, Math.ceil(durationMs / 86_400_000))
  const count = Math.min(200, Math.max(3, Math.round(5.5 * days)))

  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 2654435761 + 1013904223) >>> 0
    const offset = ((seed % 1_000_000) / 1_000_000) * durationMs
    const data_venda = new Date(Math.min(from.getTime() + offset, to.getTime() - 1000)).toISOString()
    const moeda = seed % 10 === 0 ? 'USD' : 'BRL'
    const valorBase = moeda === 'USD' ? 29.9 : 147.0
    const valor = parseFloat((valorBase * (1 + (seed % 100) / 100 * 2.5)).toFixed(2))
    return {
      id: `demo_${i}`,
      hotmart_id: `demo_${i}`,
      hotmart_produto_id: null,
      produto: demoPick(DEMO_PRODUTOS, i),
      comprador_nome: demoPick(DEMO_NOMES, i * 3),
      comprador_email: `demo${i}@example.com`,
      valor,
      moeda,
      status: demoStatus(seed),
      data_venda,
      forma_pagamento: demoPick(DEMO_PAGAMENTOS, i * 7),
      pais: demoPick(DEMO_PAISES, i * 5),
      origem: null,
    }
  }).sort((a, b) => new Date(b.data_venda).getTime() - new Date(a.data_venda).getTime())
}

const DEMO_CUSTO_PER_DAY: Partial<Record<Period, number>> = {
  today: 450, yesterday: 430, thisWeek: 420, lastWeek: 410, thisMonth: 415, lastMonth: 425,
}
export function generateDemoCusto(period: Period, customRange?: { from: Date; to: Date }): number {
  if (period === 'custom' && customRange) {
    const days = Math.max(1, Math.ceil((customRange.to.getTime() - customRange.from.getTime()) / 86_400_000))
    return days * 420
  }
  const daysMap: Partial<Record<Period, number>> = { today: 1, yesterday: 1, thisWeek: 7, lastWeek: 7, thisMonth: 25, lastMonth: 30 }
  return (daysMap[period] ?? 1) * (DEMO_CUSTO_PER_DAY[period] ?? 420)
}
