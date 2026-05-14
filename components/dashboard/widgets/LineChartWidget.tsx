'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { formatBRL } from '@/lib/utils'
import type { SeriesPoint } from '@/lib/utils'

function CustomTooltip({
  active,
  payload,
  label,
  isBRL,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
  isBRL: boolean
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f1e] px-3 py-2.5 shadow-xl">
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-100">
        {isBRL ? formatBRL(payload[0].value) : payload[0].value.toLocaleString('pt-BR')}
      </p>
    </div>
  )
}

export function LineChartWidget({
  title,
  points,
  isBRL,
}: {
  title: string
  points: SeriesPoint[]
  isBRL: boolean
}) {
  return (
    <div className="p-5">
      <h3 className="mb-5 text-sm font-semibold text-slate-200">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#475569', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: '#475569', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v =>
              isBRL
                ? v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
                : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
            }
            width={55}
          />
          <Tooltip content={<CustomTooltip isBRL={isBRL} />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#6366f1"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
