'use client'

import type { Period } from '@/lib/types'

function fmtDay(d: Date): string {
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

function monthRange(offset: 0 | -1): string {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return `${fmtDay(first)} a ${fmtDay(last)}`
}

// Mês anterior first, then Este mês
const PERIODS: { value: Period; label: string; descKey?: 'lastMonth' | 'thisMonth' }[] = [
  { value: 'today',     label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: '7d',        label: '7 dias' },
  { value: '30d',       label: '30 dias' },
  { value: '90d',       label: '3 meses' },
  { value: '180d',      label: '6 meses' },
  { value: '365d',      label: '1 ano' },
  { value: 'lastMonth', label: 'Mês anterior', descKey: 'lastMonth' },
  { value: 'thisMonth', label: 'Este mês',     descKey: 'thisMonth' },
]

interface PeriodFilterProps {
  value: Period
  onChange: (period: Period) => void
  customFrom?: string
  customTo?: string
  onCustomChange?: (from: string, to: string) => void
}

export function PeriodFilter({
  value,
  onChange,
  customFrom = '',
  customTo = '',
  onCustomChange,
}: PeriodFilterProps) {
  const lastMonthDesc = monthRange(-1)
  const thisMonthDesc = monthRange(0)

  return (
    <div className="flex flex-col gap-2">
      <div className="dashboard-panel flex max-w-full gap-2 overflow-x-auto rounded-2xl p-1.5 sm:flex-wrap">
        {PERIODS.map(p => {
          const desc = p.descKey === 'lastMonth' ? lastMonthDesc : p.descKey === 'thisMonth' ? thisMonthDesc : undefined
          const active = value === p.value
          return (
            <button
              key={p.value}
              onClick={() => onChange(p.value)}
              className={`group relative shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-150 ${
                active
                  ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/20'
                  : 'border border-[var(--dash-border)] bg-white/5 text-[var(--dash-muted)] hover:border-[var(--dash-border-strong)] hover:bg-white/10 hover:text-[var(--dash-text)]'
              }`}
            >
              {p.label}
              {desc && (
                <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#1a1a2e] px-2.5 py-1.5 text-[10px] font-normal text-slate-400 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                  {desc}
                </span>
              )}
            </button>
          )
        })}

        <button
          onClick={() => onChange('custom')}
          className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-150 ${
            value === 'custom'
              ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/20'
              : 'border border-[var(--dash-border)] bg-white/5 text-[var(--dash-muted)] hover:border-[var(--dash-border-strong)] hover:bg-white/10 hover:text-[var(--dash-text)]'
          }`}
        >
          Personalizado
        </button>
      </div>

      {value === 'custom' && (
        <div className="dashboard-panel flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
          <span className="text-xs font-medium text-[var(--dash-faint)]">De</span>
          <input
            type="date"
            value={customFrom}
            onChange={e => onCustomChange?.(e.target.value, customTo)}
            className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] px-3 py-1.5 text-sm text-[var(--dash-text)] outline-none transition-colors focus:border-cyan-500/50"
          />
          <span className="text-xs font-medium text-[var(--dash-faint)]">Até</span>
          <input
            type="date"
            value={customTo}
            min={customFrom}
            onChange={e => onCustomChange?.(customFrom, e.target.value)}
            className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] px-3 py-1.5 text-sm text-[var(--dash-text)] outline-none transition-colors focus:border-cyan-500/50"
          />
        </div>
      )}
    </div>
  )
}
