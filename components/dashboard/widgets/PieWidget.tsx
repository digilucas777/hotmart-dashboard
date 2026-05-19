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

const PIE_COLORS = ['#00d4ff', '#a78bfa', '#22c55e', '#38bdf8', '#7c3aed', '#ef4444', '#64748b']
const DEMO_DATA = [
  { name: 'Aguardando', value: 42 },
  { name: 'Dados', value: 28 },
  { name: 'Reais', value: 18 },
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
  const empty = points.length === 0 || points.every(point => (point.value ?? 0) === 0)
  const data = empty ? DEMO_DATA : points.map(p => ({ name: p.label, value: p.value }))
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const top = data.reduce((best, item) => item.value > best.value ? item : best, data[0])
  const topPercent = total > 0 ? Math.round((top.value / total) * 100) : 0

  return (
    <div className="relative z-[1] flex h-full flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
        {empty && <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-bold text-[var(--dash-faint)]">Demo</span>}
      </div>
      <div className="relative flex-1 drop-shadow-[0_0_22px_var(--dash-glow-blue)]">
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--dash-border)] bg-[color:var(--dash-panel)]/75 text-center shadow-[0_0_28px_var(--dash-glow-blue)] backdrop-blur-xl">
          <p className="text-lg font-black text-[var(--dash-text)]">{topPercent}%</p>
        </div>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Pie
            data={data}
            cx="50%"
            cy="48%"
            innerRadius="46%"
            outerRadius="66%"
            paddingAngle={2}
            dataKey="value"
            animationDuration={180}
            label={({ percent }) => percent ? `${Math.round(percent * 100)}%` : ''}
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="rgba(8,10,18,0.7)" strokeWidth={2} />
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
      {empty && <p className="mt-2 text-center text-xs font-semibold text-[var(--dash-faint)]">Aguardando dados</p>}
    </div>
  )
}
