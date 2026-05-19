'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { formatBRL, formatUSD } from '@/lib/utils'
import type { SeriesPoint } from '@/lib/utils'
import type { Period } from '@/lib/types'

const CHART_PERIODS: { value: Period; label: string }[] = [
  { value: 'thisWeek', label: 'Semana' },
  { value: 'thisMonth', label: 'Mês' },
  { value: 'lastMonth', label: 'Último mês' },
]

const DEMO_POINTS: SeriesPoint[] = [
  { label: 'Seg', value: 18, valueBRL: 18, valueUSD: 3 },
  { label: 'Ter', value: 26, valueBRL: 26, valueUSD: 5 },
  { label: 'Qua', value: 21, valueBRL: 21, valueUSD: 4 },
  { label: 'Qui', value: 38, valueBRL: 38, valueUSD: 7 },
  { label: 'Sex', value: 44, valueBRL: 44, valueUSD: 8 },
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
    <div className="rounded-2xl border border-cyan-300/20 bg-[#080a12]/95 px-3 py-2.5 shadow-[0_0_28px_rgba(0,212,255,0.18)] backdrop-blur-xl">
      <p className="mb-1.5 text-xs text-slate-400">{label}</p>
      {dualCurrency ? (
        <>
          {payload.find(p => p.dataKey === 'valueBRL') && (
            <p className="text-xs font-semibold text-emerald-300">
              BRL: {formatBRL(payload.find(p => p.dataKey === 'valueBRL')!.value)}
            </p>
          )}
          {payload.find(p => p.dataKey === 'valueUSD') && (
            <p className="text-xs font-semibold text-cyan-300">
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
  const empty = points.length === 0 || points.every(point => (point.value ?? 0) === 0 && (point.valueBRL ?? 0) === 0 && (point.valueUSD ?? 0) === 0)
  const displayPoints = empty ? DEMO_POINTS : points

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
        <LineChart data={displayPoints} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.045)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v =>
              isBRL || dualCurrency
                ? v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
                : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
            }
            width={55}
          />
          <Tooltip content={<CustomTooltip dualCurrency={dualCurrency} />} wrapperStyle={{ outline: 'none' }} cursor={{ stroke: 'rgba(0,212,255,0.22)', strokeWidth: 1 }} />
          {dualCurrency ? (
            <>
              <Legend formatter={(value) => value === 'valueBRL' ? 'BRL' : 'USD'} wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
              <Line type="monotone" dataKey="valueBRL" stroke="#22c55e" strokeWidth={2.4} dot={false} activeDot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="valueUSD" stroke="#00d4ff" strokeWidth={2.4} dot={false} activeDot={{ r: 4, fill: '#00d4ff', strokeWidth: 0 }} isAnimationActive={false} />
            </>
          ) : (
            <Line type="monotone" dataKey="value" stroke="#00d4ff" strokeWidth={2.6} dot={false} activeDot={{ r: 4, fill: '#00d4ff', strokeWidth: 0 }} isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
      {empty && (
        <div className="pointer-events-none absolute inset-x-5 bottom-5 rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-xs font-semibold text-[var(--dash-faint)] backdrop-blur">
          Aguardando dados
        </div>
      )}
    </div>
  )
}
