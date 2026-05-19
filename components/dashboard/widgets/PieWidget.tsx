'use client'

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
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
      <div className="relative min-h-0 flex-1">
        <div className="relative grid h-full min-h-[160px] place-items-center">
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--dash-border)] bg-[color:var(--dash-panel)]/90 text-center shadow-sm">
          <p className="text-lg font-black text-[var(--dash-text)]">{topPercent}%</p>
            </div>
        </div>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius="48%"
            outerRadius="66%"
            paddingAngle={2}
            dataKey="value"
            animationDuration={120}
            label={false}
            labelLine={false}
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="rgba(8,10,18,0.7)" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {data.slice(0, 6).map((item, index) => (
            <div key={item.name} className="flex min-w-0 items-center gap-1.5 text-[10px] text-[var(--dash-faint)]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
              <span className="truncate">{item.name}</span>
            </div>
          ))}
        </div>
      </div>
      {empty && <p className="mt-2 text-center text-xs font-semibold text-[var(--dash-faint)]">Aguardando dados</p>}
    </div>
  )
}
