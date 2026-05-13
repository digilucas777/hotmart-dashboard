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
import { formatBRL, type ChartPoint } from '@/lib/utils'

interface TooltipPayload {
  value: number
  name: string
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f1e] px-3 py-2.5 shadow-xl">
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-100">
        {formatBRL(payload[0].value)}
      </p>
      {payload[1] && (
        <p className="text-xs text-slate-500">{payload[1].value} venda(s)</p>
      )}
    </div>
  )
}

export function SalesLineChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="rounded-2xl border border-white/7 bg-[#191929] p-5">
      <h3 className="mb-5 text-sm font-semibold text-slate-200">
        Faturamento no período
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            vertical={false}
          />
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
              v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
            }
            width={55}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="valor"
            stroke="#6366f1"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="transparent"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
