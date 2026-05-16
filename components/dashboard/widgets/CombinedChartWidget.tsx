'use client'

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { computeWidgetData, formatBRL, formatUSD } from '@/lib/utils'
import type { Period, Venda } from '@/lib/types'
import type { CombinedPoint } from '@/lib/utils'

const LEGEND_LABELS: Record<string, string> = {
  valueBRL: 'Receita BRL',
  valueUSD: 'Receita USD',
  approved: 'Aprovadas',
  reembolsos: 'Reembolsos',
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number; dataKey: string; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f1e] px-3 py-2.5 shadow-xl">
      <p className="mb-1.5 text-xs text-slate-500">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs font-semibold" style={{ color: p.color }}>
          {p.dataKey === 'valueBRL'
            ? `BRL: ${formatBRL(p.value)}`
            : p.dataKey === 'valueUSD'
              ? `USD: ${formatUSD(p.value)}`
              : p.dataKey === 'approved'
                ? `Aprovadas: ${p.value}`
                : `Reembolsos: ${p.value}`}
        </p>
      ))}
    </div>
  )
}

export function CombinedChartWidget({
  title,
  vendas,
  chartHeight = 220,
}: {
  title: string
  vendas: Venda[]
  chartHeight?: number
}) {
  const [internalPeriod, setInternalPeriod] = useState<Period>('7d')
  const points = useMemo(() => {
    const data = computeWidgetData(vendas, 'combined_by_day', internalPeriod, 1)
    return data.kind === 'combined' ? data.points : []
  }, [vendas, internalPeriod])

  const periods: { value: Period; label: string }[] = [
    { value: 'today', label: 'Hoje' },
    { value: '7d', label: '7 dias' },
    { value: '30d', label: '30 dias' },
    { value: 'thisMonth', label: 'Este mês' },
  ]

  return (
    <div className="p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <div className="flex rounded-lg bg-white/5 p-1">
          {periods.map(option => (
            <button
              key={option.value}
              onClick={() => setInternalPeriod(option.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                internalPeriod === option.value
                  ? 'bg-indigo-500 text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ComposedChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#475569', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="revenue"
            orientation="left"
            tick={{ fill: '#475569', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`}
            width={55}
          />
          <YAxis
            yAxisId="count"
            orientation="right"
            tick={{ fill: '#475569', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={value => (
              <span style={{ color: '#64748b', fontSize: 11 }}>
                {LEGEND_LABELS[value] ?? value}
              </span>
            )}
          />
          <Bar
            yAxisId="revenue"
            dataKey="valueBRL"
            name="valueBRL"
            fill="#22c55e"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
          <Bar
            yAxisId="revenue"
            dataKey="valueUSD"
            name="valueUSD"
            fill="#6366f1"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
          <Line
            yAxisId="count"
            type="monotone"
            dataKey="approved"
            name="approved"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
          />
          <Line
            yAxisId="count"
            type="monotone"
            dataKey="reembolsos"
            name="reembolsos"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#ef4444', strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
