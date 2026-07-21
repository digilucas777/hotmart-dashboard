'use client'

import {
  DollarSign,
  CheckCircle,
  TrendingUp,
  CreditCard,
  BadgeX,
  Clock,
  AlertTriangle,
  Percent,
  Landmark,
  BarChart2,
} from 'lucide-react'
import type { WidgetDataSource } from '@/lib/types'

const ICON_MAP: Partial<Record<WidgetDataSource, React.ElementType>> = {
  total_converted: DollarSign,
  total_brl:       DollarSign,
  total_usd:       DollarSign,
  sales_count:     CheckCircle,
  approval_rate:   TrendingUp,
  avg_ticket:      CreditCard,
  refunds_count:   BadgeX,
  chargebacks_count: BadgeX,
  disputed_count:  AlertTriangle,
  pending_count:   Clock,
  cancelled_count: AlertTriangle,
  commission:      Percent,
  comissao_33:     Percent,
  lucro:           Landmark,
  lucro_usd:       TrendingUp,
  margem_lucro:    Percent,
  roas:            BarChart2,
  cpa:             DollarSign,
}

const ACCENT_MAP: Partial<Record<WidgetDataSource, string>> = {
  total_converted: '#67e8f9',
  total_brl:       '#4ade80',
  total_usd:       '#7dd3fc',
  sales_count:     '#4ade80',
  approval_rate:   '#67e8f9',
  avg_ticket:      '#c4b5fd',
  refunds_count:   '#f87171',
  chargebacks_count: '#dc2626',
  disputed_count:  '#fb923c',
  pending_count:   '#facc15',
  cancelled_count: '#fb923c',
  commission:      '#6ee7b7',
  comissao_33:     '#6ee7b7',
  lucro:           '#4ade80',
  lucro_usd:       '#4ade80',
  margem_lucro:    '#4ade80',
  roas:            '#6366f1',
  cpa:             '#f87171',
}

const DEFAULT_ACCENT = '#67e8f9'

export function MetricWidget({
  title,
  value,
  subValue,
  dataSource,
  comparison,
  numericValue,
}: {
  title: string
  value: string
  subValue: string
  dataSource: WidgetDataSource
  comparison?: string | null
  numericValue?: number
}) {
  const Icon = ICON_MAP[dataSource] ?? DollarSign
  const isLucro = dataSource === 'lucro' || dataSource === 'lucro_usd' || dataSource === 'comissao_33'
  const accent = (() => {
    if (isLucro && numericValue !== undefined) {
      if (numericValue < 0) return '#f87171'
      if (numericValue === 0) return '#94a3b8'
      return '#4ade80'
    }
    return ACCENT_MAP[dataSource] ?? DEFAULT_ACCENT
  })()

  const isPositive = comparison?.startsWith('↑')
  const isNegative = comparison?.startsWith('↓')
  const changeColor = isPositive ? '#10b981' : isNegative ? '#ef4444' : '#64748b'

  const [changePart, periodPart] = comparison?.includes(' vs ')
    ? [comparison.split(' vs ')[0]!, comparison.split(' vs ').slice(1).join(' vs ')]
    : [comparison ?? null, null]

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden p-5">
      {/* Accent glow */}
      <div
        className="pointer-events-none absolute right-0 top-0 h-32 w-32 opacity-[0.06]"
        style={{ background: `radial-gradient(circle, ${accent}, transparent 70%)` }}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--dash-faint)]">
            {isLucro || dataSource === 'margem_lucro' ? 'Personalizado' : 'Hotmart'}
          </p>
          <p className="mt-0.5 truncate text-xs font-semibold text-[var(--dash-muted)]">{title}</p>
        </div>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${accent}22`, border: `1px solid ${accent}33` }}
        >
          <Icon size={16} style={{ color: accent }} />
        </div>
      </div>

      {/* Value */}
      <div className="mt-3 flex-1">
        <p
          className="text-2xl font-black leading-none tracking-tight sm:text-3xl"
          style={{ color: accent }}
        >
          {value}
        </p>
        {subValue && (
          <p className="mt-1 text-sm font-semibold text-[var(--dash-muted)]">{subValue}</p>
        )}
      </div>

      {/* Footer */}
      {changePart && (
        <div className="mt-3 flex items-center gap-2">
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
            style={{ background: `${changeColor}18`, color: changeColor, border: `1px solid ${changeColor}30` }}
          >
            {changePart}
          </span>
          {periodPart && (
            <span className="text-xs text-[var(--dash-faint)]">vs {periodPart}</span>
          )}
        </div>
      )}
    </div>
  )
}
