'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import type { Period } from '@/lib/types'
import { formatPeriodContext } from '@/lib/utils'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'thisWeek', label: 'Esta semana' },
  { value: 'lastWeek', label: 'Semana passada' },
  { value: 'thisMonth', label: 'Este mês' },
  { value: 'lastMonth', label: 'Último mês' },
]

interface PeriodFilterProps {
  value: Period
  onChange: (period: Period) => void
  customFrom?: string
  customTo?: string
  onCustomChange?: (from: string, to: string) => void
  updatedAt?: Date | null
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseLocal(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}

export function PeriodFilter({
  value,
  onChange,
  customFrom = '',
  customTo = '',
  onCustomChange,
  updatedAt,
}: PeriodFilterProps) {
  const [showCustom, setShowCustom] = useState(false)
  const [draftFrom, setDraftFrom] = useState(customFrom)
  const [draftTo, setDraftTo] = useState(customTo)

  const customRange = useMemo(() => {
    if (value !== 'custom' || !customFrom || !customTo) return undefined
    return { from: parseLocal(customFrom), to: new Date(parseLocal(customTo).getTime() + 86_400_000) }
  }, [value, customFrom, customTo])

  const updatedLabel = updatedAt
    ? `Atualizado há ${Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 1000))} segundos`
    : 'Atualizando dados'

  function openCustom() {
    setDraftFrom(customFrom)
    setDraftTo(customTo)
    setShowCustom(true)
  }

  function applyCustom() {
    onCustomChange?.(draftFrom, draftTo)
    onChange('custom')
    setShowCustom(false)
  }

  function applyShortcut(months: number) {
    const to = new Date()
    const from = new Date(to.getFullYear(), to.getMonth() - months, to.getDate())
    setDraftFrom(isoDate(from))
    setDraftTo(isoDate(to))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="dashboard-panel flex max-w-full gap-2 overflow-x-auto rounded-2xl p-1.5 sm:flex-wrap">
        {PERIODS.map(p => {
          const active = value === p.value
          return (
            <button
              key={p.value}
              onClick={() => onChange(p.value)}
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
          onClick={openCustom}
          className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-150 ${
            value === 'custom'
              ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/20'
              : 'border border-[var(--dash-border)] bg-white/5 text-[var(--dash-muted)] hover:border-[var(--dash-border-strong)] hover:bg-white/10 hover:text-[var(--dash-text)]'
          }`}
        >
          Personalizado
        </button>
      </div>

      <div className="px-1 text-xs leading-relaxed text-[var(--dash-faint)]">
        <span className="font-semibold text-[var(--dash-muted)]">{formatPeriodContext(value, customRange)}</span>
        <span className="mx-2 text-[var(--dash-border-strong)]">•</span>
        <span>{updatedLabel}</span>
      </div>

      {showCustom && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 backdrop-blur-xl">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#10101d]/95 shadow-2xl shadow-cyan-500/10">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/12 text-cyan-300">
                  <CalendarDays size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-100">Período personalizado</h3>
                  <p className="text-xs text-slate-500">Escolha datas ou use um atalho.</p>
                </div>
              </div>
              <button onClick={() => setShowCustom(false)} className="rounded-xl p-2 text-slate-500 hover:bg-white/5 hover:text-slate-200">
                <X size={17} />
              </button>
            </div>
            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-400">Data inicial</span>
                  <input
                    type="date"
                    value={draftFrom}
                    onChange={e => setDraftFrom(e.target.value)}
                    className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-400">Data final</span>
                  <input
                    type="date"
                    value={draftTo}
                    min={draftFrom}
                    onChange={e => setDraftTo(e.target.value)}
                    className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-100 outline-none focus:border-cyan-400/50"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {[3, 6, 12].map(months => (
                  <button
                    key={months}
                    onClick={() => applyShortcut(months)}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-cyan-300/35 hover:text-cyan-200"
                  >
                    {months} meses
                  </button>
                ))}
              </div>
              <button
                onClick={applyCustom}
                disabled={!draftFrom || !draftTo}
                className="h-11 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-500 text-sm font-black text-white shadow-lg shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Aplicar período
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
