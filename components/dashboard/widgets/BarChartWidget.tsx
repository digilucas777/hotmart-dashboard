'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts'
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

const BAR_COLORS = { brl: '#00d4ff', usd: '#a78bfa' }
const BAR_COLORS_LIST = [BAR_COLORS.brl, BAR_COLORS.usd, '#22c55e', '#38bdf8']

function CustomXAxisTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const raw = payload?.value ?? ''
  const label = raw.length > 15 ? raw.slice(0, 15) + '…' : raw
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={8} textAnchor="end" fill="#64748b" fontSize={10} transform="rotate(-35)">
        {label}
      </text>
    </g>
  )
}

function CustomTooltip({
  active,
  payload,
  label,
  isBRL,
  dualCurrency,
}: {
  active?: boolean
  payload?: { value: number; dataKey: string; payload?: SeriesPoint }[]
  label?: string
  isBRL: boolean
  dualCurrency?: boolean
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-2xl border border-cyan-300/20 bg-[#080a12]/95 px-3 py-2.5 text-white shadow-[0_0_28px_rgba(0,212,255,0.18)] backdrop-blur-xl">
      <p className="mb-1 text-xs text-slate-400">{label}</p>
      {dualCurrency ? (
        <>
          {payload.find(p => p.dataKey === 'valueBRL') && (
            <p className="text-xs font-semibold text-emerald-300">BRL: {formatBRL(payload.find(p => p.dataKey === 'valueBRL')!.value)}</p>
          )}
          {payload.find(p => p.dataKey === 'valueUSD') && (
            <p className="text-xs font-semibold text-cyan-300">USD: {formatUSD(payload.find(p => p.dataKey === 'valueUSD')!.value)}</p>
          )}
        </>
      ) : point?.currency === 'USD' && point?.valueBRL != null ? (
        <>
          <p className="text-sm font-semibold text-emerald-300">{formatBRL(point.valueBRL)}</p>
          <p className="text-xs font-medium text-cyan-300">({formatUSD(payload[0].value)})</p>
          {point.count !== undefined && <div style={{fontSize:'11px', opacity:0.7}}>{point.count} venda{point.count !== 1 ? 's' : ''}</div>}
        </>
      ) : (
        <p className="text-sm font-semibold text-slate-100">
          {point?.currency === 'BRL' || isBRL
            ? formatBRL(payload[0].value)
            : payload[0].value.toLocaleString('pt-BR')}
        </p>
      )}
      {point?.count !== undefined && point?.currency !== 'USD' && <div style={{fontSize:'11px', opacity:0.7}}>{point.count} venda{point.count !== 1 ? 's' : ''}</div>}
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
  rotateLabels = false,
}: {
  title: string
  points: SeriesPoint[]
  isBRL: boolean
  dualCurrency?: boolean
  chartHeight?: number
  localPeriod?: Period
  onChangePeriod?: (p: Period) => void
  rotateLabels?: boolean
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
                  localPeriod === p.value ? 'bg-white/10 text-[var(--dash-text)]' : 'text-[var(--dash-faint)] hover:text-[var(--dash-muted)]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={displayPoints} margin={{ top: 4, right: 8, left: 0, bottom: rotateLabels ? 44 : 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.045)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={rotateLabels ? <CustomXAxisTick /> : { fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={rotateLabels ? 0 : 'preserveStartEnd'}
            height={rotateLabels ? 60 : 30}
          />
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
          <Tooltip content={<CustomTooltip isBRL={isBRL} dualCurrency={dualCurrency} />} cursor={{ fill: 'rgba(0,212,255,0.06)' }} wrapperStyle={{ outline: 'none' }} />
          {dualCurrency ? (
            <>
              <Legend formatter={(value) => value === 'valueBRL' ? 'BRL' : 'USD'} wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
              <Bar dataKey="valueBRL" name="valueBRL" fill={BAR_COLORS.brl} radius={[6, 6, 0, 0]} maxBarSize={32} isAnimationActive={false} />
              <Bar dataKey="valueUSD" name="valueUSD" fill={BAR_COLORS.usd} radius={[6, 6, 0, 0]} maxBarSize={32} isAnimationActive={false} />
            </>
          ) : (
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
              {displayPoints.map((_, i) => <Cell key={i} fill={BAR_COLORS_LIST[i % BAR_COLORS_LIST.length]} />)}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
      {empty && (
        <div className="pointer-events-none absolute inset-x-5 bottom-5 rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-xs font-semibold text-[var(--dash-faint)] backdrop-blur">
          Aguardando dados
        </div>
      )}
    </div>
  )
}
