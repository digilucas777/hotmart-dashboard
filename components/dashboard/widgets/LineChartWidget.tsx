'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { formatBRL, formatUSD } from '@/lib/utils'
import type { SeriesPoint } from '@/lib/utils'
import type { Period } from '@/lib/types'

const CHART_PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
]

function CustomTooltip({
  active,
  payload,
  label,
  dualCurrency,
}: {
  active?: boolean
  payload?: { value: number; dataKey: string }[]
  label?: string
  dualCurrency?: boolean
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f1e] px-3 py-2.5 shadow-xl">
      <p className="mb-1.5 text-xs text-slate-500">{label}</p>
      {dualCurrency ? (
        <>
          {payload.find(p => p.dataKey === 'valueBRL') && (
            <p className="text-xs font-semibold text-green-400">
              BRL: {formatBRL(payload.find(p => p.dataKey === 'valueBRL')!.value)}
            </p>
          )}
          {payload.find(p => p.dataKey === 'valueUSD') && (
            <p className="text-xs font-semibold text-indigo-400">
              USD: {formatUSD(payload.find(p => p.dataKey === 'valueUSD')!.value)}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm font-semibold text-slate-100">
          {payload[0].value.toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  )
}

export function LineChartWidget({
  title,
  points,
  isBRL,
  dualCurrency,
  chartHeight = 220,
  localPeriod,
  onChangePeriod,
}: {
  title: string
  points: SeriesPoint[]
  isBRL: boolean
  dualCurrency?: boolean
  chartHeight?: number
  localPeriod?: Period
  onChangePeriod?: (p: Period) => void
}) {
  return (
    <div className="relative z-[1] p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
        {localPeriod && onChangePeriod && (
          <div className="flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
            {CHART_PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => onChangePeriod(p.value)}
                className={`rounded-md px-2 py-1 text-[10px] font-bold transition-all ${
                  localPeriod === p.value
                    ? 'bg-white/10 text-[var(--dash-text)]'
                    : 'text-[var(--dash-faint)] hover:text-[var(--dash-muted)]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={chartHeight}>
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
              isBRL || dualCurrency
                ? v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
                : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
            }
            width={55}
          />
          <Tooltip content={<CustomTooltip dualCurrency={dualCurrency} />} />
          {dualCurrency ? (
            <>
              <Legend
                formatter={(value) => value === 'valueBRL' ? 'BRL' : 'USD'}
                wrapperStyle={{ fontSize: 11, color: '#475569' }}
              />
              <Line
                type="monotone"
                dataKey="valueBRL"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="valueUSD"
                stroke="#00d4ff"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#00d4ff', strokeWidth: 0 }}
              />
            </>
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              stroke="#00d4ff"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: '#00d4ff', strokeWidth: 0 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
