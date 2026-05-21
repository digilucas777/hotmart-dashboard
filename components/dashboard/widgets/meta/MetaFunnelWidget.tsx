'use client'

import type { MetaFunnelResult } from '@/lib/meta-ads-mock'

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString('pt-BR')
}

const STEP_COLORS = ['#00d4ff', '#38bdf8', '#6366f1', '#8b5cf6', '#10b981']

export function MetaFunnelWidget({ title, data, isDemo = true }: { title: string; data: MetaFunnelResult; isDemo?: boolean }) {
  const maxCount = data.steps[0]?.count ?? 1

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--dash-faint)]">Meta Ads · Funil</p>
          <p className="text-sm font-bold text-[var(--dash-text)]">{title}</p>
        </div>
        {isDemo && (
          <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-cyan-300/70">
            Demo
          </span>
        )}
      </div>

      {/* Steps */}
      <div className="flex flex-1 flex-col justify-between gap-2 overflow-auto px-5 py-4">
        {data.steps.map((step, i) => {
          const pct = maxCount > 0 ? (step.count / maxCount) * 100 : 0
          const color = STEP_COLORS[i] ?? '#6366f1'
          return (
            <div key={step.label} className="rounded-2xl border border-white/7 bg-white/[0.025] p-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm leading-none">{step.icon}</span>
                  <span className="text-xs font-semibold text-[var(--dash-text)]">{step.label}</span>
                  {step.conversionRate !== undefined && i > 0 && (
                    <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-[var(--dash-muted)]">
                      {(step.conversionRate * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 text-right">
                  <span className="text-xs font-black text-[var(--dash-text)]">{fmtNum(step.count)}</span>
                  {step.cost > 0 && (
                    <span className="text-[10px] text-[var(--dash-faint)]">
                      R${step.cost.toFixed(2)}/uni
                    </span>
                  )}
                </div>
              </div>
              <div className="mx-auto h-9 overflow-hidden rounded-xl bg-white/[0.045]" style={{ width: `${Math.max(34, pct)}%` }}>
                <div
                  className="flex h-full items-center justify-center rounded-xl text-[10px] font-black text-white/90 transition-all duration-700"
                  style={{
                    width: '100%',
                    background: `linear-gradient(90deg, ${color}bb, ${color})`,
                    boxShadow: `0 0 18px ${color}44`,
                  }}
                >
                  {pct.toFixed(0)}%
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
