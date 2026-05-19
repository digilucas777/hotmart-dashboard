'use client'

import { useState } from 'react'
import type { Period } from '@/lib/types'

function fmtDay(d: Date): string {
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}

function getMonthDesc(key: 'thisMonth' | 'lastMonth'): string {
  const now = new Date()
  if (key === 'lastMonth') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last = new Date(now.getFullYear(), now.getMonth(), 0)
    return `${fmtDay(first)} a ${fmtDay(last)}`
  }
  // thisMonth: first day of month → today
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  return `${fmtDay(first)} a ${fmtDay(now)}`
}

// Mês anterior first, Este mês second
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
  const [hoveredMonth, setHoveredMonth] = useState<'thisMonth' | 'lastMonth' | null>(null)

  const hoveredDesc = hoveredMonth ? getMonthDesc(hoveredMonth) : null
  const hoveredLabel = hoveredMonth === 'lastMonth' ? 'Mês anterior' : hoveredMonth === 'thisMonth' ? 'Este mês' : null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="dashboard-panel flex max-w-full gap-2 overflow-x-auto rounded-2xl p-1.5 sm:flex-wrap">
        {PERIODS.map(p => {
          const active = value === p.value
          return (
            <button
              key={p.value}
              onClick={() => onChange(p.value)}
              onMouseEnter={() => p.descKey ? setHoveredMonth(p.descKey) : undefined}
              onMouseLeave={() => setHoveredMonth(null)}
              className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-150 ${
                active
                  ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/20'
                  : 'border border-[var(--dash-border)] bg-white/5 text-[var(--dash-muted)] hover:border-[var(--dash-border-strong)] hover:bg-white/10 hover:text-[var(--dash-text)]'
              }`}
            >
              {p.label}
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

      {/* Month date range — appears below on hover, outside overflow container */}
      <div className="flex h-4 items-center px-1">
        {hoveredDesc && (
          <p className="text-[11px] text-[var(--dash-faint)]">
            <span className="font-semibold text-[var(--dash-muted)]">{hoveredLabel}:</span>{' '}
            {hoveredDesc}
          </p>
        )}
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
