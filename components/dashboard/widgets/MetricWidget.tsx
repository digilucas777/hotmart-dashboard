'use client'

import {
  DollarSign,
  CheckCircle,
  TrendingUp,
  CreditCard,
  BadgeX,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import type { WidgetDataSource } from '@/lib/types'

const ICON_MAP: Partial<Record<WidgetDataSource, React.ElementType>> = {
  total_converted: DollarSign,
  total_brl: DollarSign,
  total_usd: DollarSign,
  sales_count: CheckCircle,
  approval_rate: TrendingUp,
  avg_ticket: CreditCard,
  refunds_count: BadgeX,
  pending_count: Clock,
  cancelled_count: AlertTriangle,
}

const COLOR_MAP: Partial<Record<WidgetDataSource, { icon: string; bg: string }>> = {
  total_converted: { icon: 'text-cyan-300', bg: 'bg-cyan-400/15' },
  total_brl: { icon: 'text-green-400', bg: 'bg-green-500/12' },
  total_usd: { icon: 'text-sky-300', bg: 'bg-sky-400/15' },
  sales_count: { icon: 'text-green-400', bg: 'bg-green-500/12' },
  approval_rate: { icon: 'text-cyan-300', bg: 'bg-cyan-400/15' },
  avg_ticket: { icon: 'text-violet-300', bg: 'bg-violet-400/15' },
  refunds_count: { icon: 'text-red-400', bg: 'bg-red-500/12' },
  pending_count: { icon: 'text-yellow-400', bg: 'bg-yellow-500/12' },
  cancelled_count: { icon: 'text-orange-400', bg: 'bg-orange-500/12' },
}

const DEFAULT_COLORS = { icon: 'text-cyan-300', bg: 'bg-cyan-400/15' }

export function MetricWidget({
  title,
  value,
  subValue,
  dataSource,
}: {
  title: string
  value: string
  subValue: string
  dataSource: WidgetDataSource
}) {
  const Icon = ICON_MAP[dataSource] ?? DollarSign
  const colors = COLOR_MAP[dataSource] ?? DEFAULT_COLORS

  return (
    <div className="relative z-[1] flex h-full flex-col justify-between gap-3 p-5">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/35 to-transparent" />
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl shadow-lg shadow-cyan-500/15 ${colors.bg}`}>
        <Icon size={17} className={colors.icon} />
      </div>
      <div>
        <p className="text-xs font-medium text-[var(--dash-faint)]">{title}</p>
        <p className="mt-1 text-[1.65rem] font-extrabold leading-tight text-[var(--dash-text)] drop-shadow">
          {value}
        </p>
        {subValue && <p className="mt-0.5 text-xs text-[var(--dash-faint)]">{subValue}</p>}
      </div>
    </div>
  )
}
