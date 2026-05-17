'use client'

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import { computeWidgetData, formatBRL, formatUSD } from '@/lib/utils'
import type { Period, Venda } from '@/lib/types'

const LEGEND_LABELS: Record<string, string> = {
  valueBRL: 'Faturamento BRL',
  valueUSD: 'Faturamento USD',
  approved: 'Aprovadas',
  reembolsos: 'Reembolsos',
}

const SERIES_COLORS: Record<string, string> = {
  valueBRL: '#22c55e',
  valueUSD: '#a855f7',
  approved: '#0ea5e9',
  reembolsos: '#ef4444',
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
    <div className="rounded-xl border border-white/15 bg-[#f8f7f4] px-3 py-2.5 text-right shadow-xl shadow-black/30">
      <p className="mb-1.5 text-xs font-bold text-slate-950">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs font-medium text-slate-950">
          <span>{LEGEND_LABELS[p.dataKey] ?? p.dataKey} </span>
          <span className="font-bold" style={{ color: p.color }}>
          {p.dataKey === 'valueBRL'
            ? formatBRL(p.value)
            : p.dataKey === 'valueUSD'
              ? formatUSD(p.value)
              : p.dataKey === 'approved'
                ? p.value
                : p.value}
          </span>
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
    { value: '90d', label: '3 meses' },
    { value: '180d', label: '6 meses' },
    { value: '365d', label: '1 ano' },
    { value: 'thisMonth', label: 'Este mês' },
  ]

  return (
    <div className="flex h-full flex-col p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/12 text-orange-400">
            <TrendingUp size={17} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">{title}</h3>
            <p className="text-xs text-slate-500">Desempenho diário de vendas</p>
          </div>
        </div>
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
      <div className="min-h-0 flex-1 rounded-xl border border-white/10 bg-[#111120]/70 p-4 shadow-inner shadow-black/20">
        <p className="mb-4 text-sm font-semibold text-slate-100">Vendas</p>
        <ResponsiveContainer width="100%" height={Math.max(180, chartHeight - 70)}>
        <ComposedChart data={points} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(148,163,184,0.18)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="revenue"
            orientation="left"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`}
            width={55}
          />
          <YAxis
            yAxisId="count"
            orientation="right"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="top"
            align="left"
            iconType="circle"
            wrapperStyle={{ paddingBottom: 16 }}
            formatter={value => (
              <span style={{ color: '#cbd5e1', fontSize: 12 }}>
                {LEGEND_LABELS[value] ?? value}
              </span>
            )}
          />
          <Line
            yAxisId="revenue"
            type="monotone"
            dataKey="valueBRL"
            name="valueBRL"
            stroke={SERIES_COLORS.valueBRL}
            strokeWidth={3}
            dot={{ r: 3, fill: SERIES_COLORS.valueBRL, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: SERIES_COLORS.valueBRL, stroke: '#d1fae5', strokeWidth: 2 }}
          />
          <Line
            yAxisId="revenue"
            type="monotone"
            dataKey="valueUSD"
            name="valueUSD"
            stroke={SERIES_COLORS.valueUSD}
            strokeWidth={2.5}
            dot={{ r: 3, fill: SERIES_COLORS.valueUSD, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: SERIES_COLORS.valueUSD, stroke: '#f3e8ff', strokeWidth: 2 }}
          />
          <Line
            yAxisId="count"
            type="monotone"
            dataKey="approved"
            name="approved"
            stroke={SERIES_COLORS.approved}
            strokeWidth={2.5}
            dot={{ r: 3, fill: SERIES_COLORS.approved, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: SERIES_COLORS.approved, stroke: '#e0f2fe', strokeWidth: 2 }}
          />
          <Line
            yAxisId="count"
            type="monotone"
            dataKey="reembolsos"
            name="reembolsos"
            stroke={SERIES_COLORS.reembolsos}
            strokeWidth={2}
            dot={{ r: 3, fill: SERIES_COLORS.reembolsos, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: SERIES_COLORS.reembolsos, stroke: '#fee2e2', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}
