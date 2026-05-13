'use client'

import type { Period } from '@/lib/types'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'thisMonth', label: 'Este mês' },
  { value: 'lastMonth', label: 'Mês anterior' },
]

interface PeriodFilterProps {
  value: Period
  onChange: (period: Period) => void
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PERIODS.map(p => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
            value === p.value
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
              : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
