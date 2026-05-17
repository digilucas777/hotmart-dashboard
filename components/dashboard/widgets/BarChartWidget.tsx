'use client'

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts'
import { formatBRL, formatUSD } from '@/lib/utils'
import type { SeriesPoint } from '@/lib/utils'
import type { Period } from '@/lib/types'

const CHART_PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
]

const BAR_COLORS = {
  brl: '#00d4ff',
  usd: '#a78bfa',
}

const BAR_COLORS_LIST = [BAR_COLORS.brl, BAR_COLORS.usd]

function CustomTooltip({
  active,
  payload,
  label,
  isBRL,
  dualCurrency,
}: {
  active?: boolean
  payload?: { value: number; dataKey: string }[]
  label?: string
  isBRL: boolean
  dualCurrency?: boolean
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-2xl border border-cyan-300/20 bg-[#080a12]/95 px-3 py-2.5 text-white shadow-[0_0_28px_rgba(0,212,255,0.18)] backdrop-blur-xl">
      <p className="mb-1 text-xs text-slate-400">{label}</p>
      {dualCurrency ? (
        <>
          {payload.find(p => p.dataKey === 'valueBRL') && (
            <p className="text-xs font-semibold text-green-400">
              BRL: {formatBRL(payload.find(p => p.dataKey === 'valueBRL')!.value)}
            </p>
          )}
          {payload.find(p => p.dataKey === 'valueUSD') && (
            <p className="text-xs font-semibold text-indigo-300">
              USD: {formatUSD(payload.find(p => p.dataKey === 'valueUSD')!.value)}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm font-semibold text-slate-100">
          {isBRL ? formatBRL(payload[0].value) : payload[0].value.toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  )
}

export function BarChartWidget({
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
        <BarChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
          <Tooltip
            content={<CustomTooltip isBRL={isBRL} dualCurrency={dualCurrency} />}
            cursor={{ fill: 'rgba(0,212,255,0.06)' }}
            wrapperStyle={{ outline: 'none' }}
          />
          {dualCurrency ? (
            <>
              <Legend
                formatter={(value) => value === 'valueBRL' ? 'BRL' : 'USD'}
                wrapperStyle={{ fontSize: 11, color: '#475569' }}
              />
              <Bar
                dataKey="valueBRL"
                name="valueBRL"
                fill={BAR_COLORS.brl}
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
              <Bar
                dataKey="valueUSD"
                name="valueUSD"
                fill={BAR_COLORS.usd}
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
            </>
          ) : (
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {points.map((_, i) => (
                <Cell key={i} fill={BAR_COLORS_LIST[i % BAR_COLORS_LIST.length]} />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
