'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, X } from 'lucide-react'
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

  const rangeLabel = useMemo(() => {
    const range = value === 'custom' ? customRange : undefined
    const [prefix, rest] = formatPeriodContext(value, range).split('•').map(part => part.trim())
    return { prefix, rest }
  }, [customRange, value])

  const updatedLabel = (() => {
    if (!updatedAt) return 'Sincronizando'
    const secs = Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 1000))
    if (secs < 60) return `Atualizado há ${secs}s`
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `Atualizado há ${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `Atualizado há ${hours}h`
    return `Atualizado há ${Math.floor(hours / 24)}d`
  })()

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

  useEffect(() => {
    if (!showCustom) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowCustom(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showCustom])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="dashboard-panel flex max-w-full gap-1 overflow-x-auto rounded-lg p-1 sm:flex-wrap">
        {PERIODS.map(p => {
          const active = value === p.value
          return (
            <button
              key={p.value}
              onClick={() => onChange(p.value)}
              className={`shrink-0 rounded-md px-2.5 py-1.5 text-sm font-semibold transition-colors ${
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
          className={`shrink-0 rounded-md px-2.5 py-1.5 text-sm font-semibold transition-colors ${
            value === 'custom'
              ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/20'
              : 'border border-[var(--dash-border)] bg-white/5 text-[var(--dash-muted)] hover:border-[var(--dash-border-strong)] hover:bg-white/10 hover:text-[var(--dash-text)]'
          }`}
        >
          Personalizado
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs leading-relaxed text-[var(--dash-faint)]">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.035] px-2.5 py-1">
          <CalendarDays size={13} className="text-cyan-300" />
          <span className="font-semibold text-[var(--dash-muted)]">Período analisado:</span>
          <span className="font-bold text-[var(--dash-text)]">{rangeLabel.rest ?? rangeLabel.prefix}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.025] px-2.5 py-1">
          <Clock3 size={12} className="text-[var(--dash-faint)]" />
          {updatedLabel}
        </span>
      </div>

      {showCustom && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4" onClick={() => setShowCustom(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#10101d]/95 shadow-2xl shadow-cyan-500/10" onClick={e => e.stopPropagation()}>
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
                onClick={() => setShowCustom(false)}
                className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-bold text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-slate-100"
              >
                Cancelar
              </button>
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
