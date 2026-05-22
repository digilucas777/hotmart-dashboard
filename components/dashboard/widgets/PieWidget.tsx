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
  { name: 'Aguardando', value: 42, revenue: 0 },
  { name: 'Dados', value: 28, revenue: 0 },
  { name: 'Reais', value: 18, revenue: 0 },
]

const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { name: string; value: number; payload?: { revenue?: number } }[]
}) {
  if (!active || !payload?.length) return null
  const item = payload[0]!
  const revenue = item.payload?.revenue ?? 0
  const count = item.value
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f1e] px-3 py-2 shadow-xl">
      <p className="text-sm font-semibold text-slate-100">{item.name}</p>
      <p className="text-xs text-slate-400">
        {count.toLocaleString('pt-BR')} {count === 1 ? 'venda' : 'vendas'}
        {revenue > 0 && ` | ${fmtBRL(revenue)}`}
      </p>
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
  const data = empty
    ? DEMO_DATA
    : points.map(p => ({ name: p.label, value: p.value, revenue: p.valueBRL ?? 0 }))
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const top = data.reduce((best, item) => item.value > best.value ? item : best, data[0]!)
  const topPercent = total > 0 ? Math.round((top.value / total) * 100) : 0
  const legendRows = Math.ceil(data.length / 2)
  const chartAreaHeight = Math.max(100, Math.min(chartHeight - legendRows * 24 - 20, 300))

  return (
    <div className="relative z-[1] flex h-full flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
        {empty && <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-bold text-[var(--dash-faint)]">Demo</span>}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col justify-start">
        <div className="relative grid shrink-0 place-items-center" style={{ height: chartAreaHeight }}>
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <div className="flex h-[5rem] w-[5rem] items-center justify-center rounded-full border border-[var(--dash-border)] bg-[color:var(--dash-panel)]/92 text-center shadow-sm">
              <p className="text-[1.6rem] font-black leading-none text-[var(--dash-text)]">{topPercent}%</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius="58%"
                outerRadius="86%"
                paddingAngle={2}
                minAngle={4}
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
        <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-1.5 overflow-hidden sm:grid-cols-2">
          {data.map((item, index) => (
            <div key={item.name} className="flex min-w-0 items-center gap-2 text-xs font-medium text-[var(--dash-text)]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
              <span className="truncate leading-4">{item.name}</span>
              <span className="ml-auto shrink-0 text-[10px] text-[var(--dash-faint)]">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
      {empty && <p className="mt-2 text-center text-xs font-semibold text-[var(--dash-faint)]">Aguardando dados</p>}
    </div>
  )
}
