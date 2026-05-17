'use client'

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { SeriesPoint } from '@/lib/utils'

const PIE_COLORS = [
  '#00d4ff', '#a78bfa', '#22c55e', '#f59e0b',
  '#7c3aed', '#38bdf8', '#ef4444', '#64748b',
]

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { name: string; value: number }[]
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f1e] px-3 py-2 shadow-xl">
      <p className="text-sm font-semibold text-slate-100">{payload[0].name}</p>
      <p className="text-xs text-slate-500">{payload[0].value.toLocaleString('pt-BR')}</p>
    </div>
  )
}

export function PieWidget({
  title,
  points,
  chartHeight = 220,
}: {
  title: string
  points: SeriesPoint[]
  chartHeight?: number
}) {
  if (points.length === 0) {
    return (
      <div className="flex min-h-[280px] items-center justify-center p-5">
        <p className="text-sm text-slate-600">Sem dados</p>
      </div>
    )
  }

  const data = points.map(p => ({ name: p.label, value: p.value }))

  return (
    <div className="relative z-[1] p-5">
      <h3 className="mb-5 text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={7}
            formatter={value => (
              <span style={{ color: '#64748b', fontSize: 12 }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
