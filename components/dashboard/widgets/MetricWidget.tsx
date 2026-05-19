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
  commission: Percent,
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
  commission: { icon: 'text-emerald-300', bg: 'bg-emerald-400/15' },
}

const DEFAULT_COLORS = { icon: 'text-cyan-300', bg: 'bg-cyan-400/15' }

export function MetricWidget({
  title,
  value,
  subValue,
  dataSource,
  comparison,
}: {
  title: string
  value: string
  subValue: string
  dataSource: WidgetDataSource
  comparison?: string | null
}) {
  const Icon = ICON_MAP[dataSource] ?? DollarSign
  const colors = COLOR_MAP[dataSource] ?? DEFAULT_COLORS

  return (
    <div className="relative z-[1] flex h-full flex-col gap-3 p-4">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/35 to-transparent" />
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl shadow-md shadow-cyan-500/10 ${colors.bg}`}>
        <Icon size={16} className={colors.icon} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold leading-4 text-[var(--dash-faint)]">{title}</p>
        <p className="mt-1.5 truncate text-2xl font-extrabold leading-tight text-[var(--dash-text)] drop-shadow">
          {value}
        </p>
        {subValue && <p className="mt-1 truncate text-xs leading-4 text-[var(--dash-faint)]">{subValue}</p>}
        {comparison && (
          <p className={`mt-0.5 truncate text-xs font-bold ${comparison.startsWith('↑') ? 'text-emerald-300' : comparison.startsWith('↓') ? 'text-red-300' : 'text-[var(--dash-faint)]'}`}>
            {comparison}
          </p>
        )}
      </div>
    </div>
  )
}
