'use client'

import {
  DollarSign,
  CheckCircle,
  TrendingUp,
  CreditCard,
  RotateCcw,
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
  refunds_count: RotateCcw,
  pending_count: Clock,
  cancelled_count: AlertTriangle,
}

const COLOR_MAP: Partial<Record<WidgetDataSource, { icon: string; bg: string }>> = {
  total_converted: { icon: 'text-indigo-400', bg: 'bg-indigo-500/12' },
  total_brl: { icon: 'text-green-400', bg: 'bg-green-500/12' },
  total_usd: { icon: 'text-blue-400', bg: 'bg-blue-500/12' },
  sales_count: { icon: 'text-green-400', bg: 'bg-green-500/12' },
  approval_rate: { icon: 'text-blue-400', bg: 'bg-blue-500/12' },
  avg_ticket: { icon: 'text-purple-400', bg: 'bg-purple-500/12' },
  refunds_count: { icon: 'text-red-400', bg: 'bg-red-500/12' },
  pending_count: { icon: 'text-yellow-400', bg: 'bg-yellow-500/12' },
  cancelled_count: { icon: 'text-orange-400', bg: 'bg-orange-500/12' },
}

const DEFAULT_COLORS = { icon: 'text-indigo-400', bg: 'bg-indigo-500/12' }

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
    <div className="flex flex-col gap-3 p-5">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${colors.bg}`}>
        <Icon size={17} className={colors.icon} />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{title}</p>
        <p className="mt-1 text-[1.6rem] font-bold leading-tight tracking-tight text-slate-100">
          {value}
        </p>
        {subValue && <p className="mt-0.5 text-xs text-slate-600">{subValue}</p>}
      </div>
    </div>
  )
}
