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

const BAR_COLORS = {
  brl: '#22c55e',
  usd: '#6366f1',
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
    <div className="rounded-xl border border-white/10 bg-[#0f0f1e] px-3 py-2.5 shadow-xl">
      <p className="mb-1 text-xs text-slate-500">{label}</p>
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
}: {
  title: string
  points: SeriesPoint[]
  isBRL: boolean
  dualCurrency?: boolean
}) {
  return (
    <div className="p-5">
      <h3 className="mb-5 text-sm font-semibold text-slate-200">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
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
          <Tooltip content={<CustomTooltip isBRL={isBRL} dualCurrency={dualCurrency} />} />
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
