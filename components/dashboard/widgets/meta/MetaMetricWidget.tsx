'use client'

import type { MetaMetricResult } from '@/lib/meta-ads-mock'

function formatValue(value: number, format: MetaMetricResult['format']): string {
  switch (format) {
    case 'currency_brl':
      if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
      if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}k`
      return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    case 'percentage':
      return `${value.toFixed(1)}%`
    case 'multiplier':
      return `${value.toFixed(2)}x`
    case 'decimal':
      return value.toFixed(2)
    case 'number':
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
      return value.toLocaleString('pt-BR')
  }
}

export function MetaMetricWidget({ title, data, isDemo = true }: { title: string; data: MetaMetricResult; isDemo?: boolean }) {
  const isPositive = data.change >= 0
  const isGood = data.isGoodWhenUp ? isPositive : !isPositive
  const changeColor = isGood ? '#10b981' : '#ef4444'
  const changeArrow = isPositive ? '↑' : '↓'

  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden p-5">
      {/* Accent glow bg */}
      <div
        className="pointer-events-none absolute right-0 top-0 h-32 w-32 opacity-[0.06]"
        style={{ background: `radial-gradient(circle, ${data.accentColor}, transparent 70%)` }}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--dash-faint)]">Meta Ads</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-[var(--dash-muted)]">{title}</p>
        </div>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base"
          style={{ background: `${data.accentColor}22`, border: `1px solid ${data.accentColor}33` }}
        >
          {data.icon}
        </div>
      </div>

      {/* Value */}
      <div className="mt-3 flex-1">
        <p
          className="text-2xl font-black leading-none tracking-tight sm:text-3xl"
          style={{ color: data.accentColor }}
        >
          {formatValue(data.value, data.format)}
        </p>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center gap-2">
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
          style={{ background: `${changeColor}18`, color: changeColor, border: `1px solid ${changeColor}30` }}
        >
          {changeArrow} {Math.abs(data.change).toFixed(1)}%
        </span>
        <span className="text-xs text-[var(--dash-faint)]">vs período anterior</span>
      </div>

      {isDemo && (
        <span className="absolute bottom-3 right-4 rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-400/60">
          Demo
        </span>
      )}
    </div>
  )
}
