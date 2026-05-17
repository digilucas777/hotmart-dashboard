'use client'

import type { Period } from '@/lib/types'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '3 meses' },
  { value: '180d', label: '6 meses' },
  { value: '365d', label: '1 ano' },
  { value: 'thisMonth', label: 'Este mês' },
  { value: 'lastMonth', label: 'Mês anterior' },
]

interface PeriodFilterProps {
  value: Period
  onChange: (period: Period) => void
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  return (
    <div className="dashboard-panel flex max-w-full gap-2 overflow-x-auto rounded-2xl p-1.5 sm:flex-wrap">
      {PERIODS.map(p => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-150 ${
            value === p.value
              ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/20'
              : 'border border-[var(--dash-border)] bg-white/5 text-[var(--dash-muted)] hover:border-[var(--dash-border-strong)] hover:bg-white/10 hover:text-[var(--dash-text)]'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
