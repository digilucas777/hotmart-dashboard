'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { MetaChartResult } from '@/lib/meta-ads-mock'

function fmtAxis(v: number, format: MetaChartResult['format']): string {
  switch (format) {
    case 'currency_brl':
      if (v >= 1000) return `R$${(v / 1000).toFixed(0)}k`
      return `R$${v}`
    case 'percentage':
      return `${v}%`
    case 'multiplier':
      return `${v}x`
    default:
      if (v >= 1000) return `${(v / 1000).toFixed(0)}k`
      return String(v)
  }
}

function fmtTooltip(v: number, format: MetaChartResult['format']): string {
  switch (format) {
    case 'currency_brl':
      return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    case 'percentage':
      return `${v.toFixed(1)}%`
    case 'multiplier':
      return `${v.toFixed(2)}x`
    default:
      return v.toLocaleString('pt-BR')
  }
}

export function MetaChartWidget({
  title,
  data,
  chartHeight,
}: {
  title: string
  data: MetaChartResult
  chartHeight: number
}) {
  const hasSecond = data.points.some(p => p.value2 !== undefined)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--dash-faint)]">Meta Ads</p>
          <p className="text-sm font-bold text-[var(--dash-text)]">{title}</p>
        </div>
        <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-400/60">
          Demo
        </span>
      </div>

      {/* Chart */}
      <div className="flex-1 px-2 pb-3 pt-1" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.points} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => String(v).slice(5)}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => fmtAxis(Number(v), data.format)}
            />
            <Tooltip
              contentStyle={{
                background: '#0d0d1f',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                fontSize: 12,
                color: '#e2e8f0',
              }}
              formatter={(v, name) => [fmtTooltip(Number(v), data.format), name]}
              labelFormatter={v => `${v}`}
            />
            {hasSecond && (
              <Legend
                wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                formatter={v => <span style={{ color: 'rgba(255,255,255,0.5)' }}>{v}</span>}
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              name={data.metric}
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }}
            />
            {hasSecond && (
              <Line
                type="monotone"
                dataKey="value2"
                name={data.metric2 ?? ''}
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
