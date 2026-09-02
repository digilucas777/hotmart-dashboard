'use client'

import type { MetaMetricResult } from '@/lib/meta-ads-mock'

function fmtBRL(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtUSD(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatValue(value: number, format: MetaMetricResult['format']): string {
  switch (format) {
    case 'currency_brl': return fmtBRL(value)
    case 'percentage':   return `${value.toFixed(1)}%`
    case 'multiplier':   return `${value.toFixed(2)}x`
    case 'decimal':      return value.toFixed(2)
    case 'number':
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
      if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
      return value.toLocaleString('pt-BR')
  }
}

export function MetaMetricWidget({ title, data, isDemo = true, isPersonalizado = false }: { title: string; data: MetaMetricResult; isDemo?: boolean; isPersonalizado?: boolean }) {
  const isDual = data.format === 'currency_brl' && data.valueUsd !== undefined

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
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--dash-faint)]">{isPersonalizado ? 'Personalizado' : 'Meta Ads'}</p>
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
        {isDual ? (
          <div>
            <p
              className="text-2xl font-black leading-none tracking-tight sm:text-3xl"
              style={{ color: isDemo ? 'var(--dash-faint)' : data.accentColor }}
            >
              {fmtUSD(data.valueUsd!)}
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--dash-muted)]">
              {fmtBRL(data.value)}
            </p>
          </div>
        ) : (
          <p
            className="text-2xl font-black leading-none tracking-tight sm:text-3xl"
            style={{ color: isDemo ? 'var(--dash-faint)' : data.accentColor }}
          >
            {formatValue(data.value, data.format)}
          </p>
        )}
        {isDemo && (
          <p className="mt-1 text-[11px] font-semibold text-[var(--dash-faint)]">(sem dados)</p>
        )}
      </div>
    </div>
  )
}
