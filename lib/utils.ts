import type { Period, Venda } from './types'

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
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    approved: 'Aprovado',
    refunded: 'Reembolsado',
    cancelled: 'Chargeback',
    pending: 'Pendente',
  }
  return map[status] ?? status
}

export function normalizePagamento(method?: string | null): string {
  if (!method) return 'Outros'
  const m = method.toLowerCase()
  if (m.includes('pix')) return 'Pix'
  if (
    m.includes('credit') ||
    m.includes('card') ||
    m.includes('cartao') ||
    m.includes('cartão') ||
    m.includes('debit')
  )
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
      if (point) {
        point.valor += v.valor
        point.count += 1
      }
    }
  })

  return days
}

export type PiePoint = { name: string; value: number; color: string }

const PIE_COLORS: Record<string, string> = {
  Pix: '#22c55e',
  Cartão: '#6366f1',
  Boleto: '#f59e0b',
  Outros: '#64748b',
}

export function buildPieData(vendas: Venda[]): PiePoint[] {
  const approved = vendas.filter(v => v.status === 'approved')
  const groups: Record<string, number> = {}
  approved.forEach(v => {
    const key = normalizePagamento(v.forma_pagamento)
    groups[key] = (groups[key] ?? 0) + 1
  })
  return Object.entries(groups).map(([name, value]) => ({
    name,
    value,
    color: PIE_COLORS[name] ?? '#64748b',
  }))
}
