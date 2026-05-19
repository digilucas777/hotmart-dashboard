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
  const chartAreaHeight = Math.max(150, Math.min(chartHeight - 36, 280))

  return (
    <div className="relative z-[1] flex h-full flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
        {empty && <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-bold text-[var(--dash-faint)]">Demo</span>}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col justify-start">
        <div className="relative grid shrink-0 place-items-center" style={{ height: chartAreaHeight, transform: 'translateY(-4px)' }}>
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border border-[var(--dash-border)] bg-[color:var(--dash-panel)]/92 text-center shadow-sm">
              <p className="text-[1.4rem] font-black leading-none text-[var(--dash-text)]">{topPercent}%</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius="56%"
                outerRadius="82%"
                paddingAngle={2}
                dataKey="value"
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
        <div className="-mt-1 grid max-h-24 grid-cols-1 gap-x-3 gap-y-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
          {data.map((item, index) => (
            <div key={item.name} className="flex min-w-0 items-center gap-2 text-[11px] font-medium text-[var(--dash-muted)]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
              <span className="truncate leading-4">{item.name}</span>
            </div>
          ))}
        </div>
      </div>
      {empty && <p className="mt-2 text-center text-xs font-semibold text-[var(--dash-faint)]">Aguardando dados</p>}
    </div>
  )
}
