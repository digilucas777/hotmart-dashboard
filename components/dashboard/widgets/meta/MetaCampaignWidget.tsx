'use client'

import type { MetaCampaignResult } from '@/lib/meta-ads-mock'

function fmtCurrency(n: number): string {
  if (n >= 1_000) return `R$${(n / 1_000).toFixed(1)}k`
  return `R$${n.toFixed(0)}`
}

export function MetaCampaignWidget({ title, data, isDemo = true }: { title: string; data: MetaCampaignResult; isDemo?: boolean }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--dash-faint)]">Meta Ads · Campanhas</p>
          <p className="text-sm font-bold text-[var(--dash-text)]">{title}</p>
        </div>
        {isDemo && (
          <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-400/60">
            Demo
          </span>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--dash-panel)]">
            <tr className="border-b border-white/5">
              {['Campanha', 'Gasto', 'ROAS', 'CPA', 'Conv.', 'CTR'].map((h, i) => (
                <th
                  key={h}
                  className={`py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dash-faint)] ${
                    i === 0 ? 'pl-5 pr-3 text-left' : i === 5 ? 'pl-3 pr-5 text-right' : 'px-3 text-right'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.campaigns.map(camp => (
              <tr
                key={camp.id}
                className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
              >
                <td className="py-3 pl-5 pr-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: camp.status === 'ACTIVE' ? '#10b981' : '#64748b' }}
                    />
                    <span className="line-clamp-1 font-medium text-[var(--dash-text)]">{camp.name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-mono text-[var(--dash-muted)]">
                  {fmtCurrency(camp.spend)}
                </td>
                <td
                  className={`px-3 py-3 text-right font-bold ${
                    camp.roas >= 3 ? 'text-emerald-400' : camp.roas >= 2 ? 'text-amber-400' : 'text-red-400'
                  }`}
                >
                  {camp.roas.toFixed(2)}x
                </td>
                <td
                  className={`px-3 py-3 text-right font-mono ${
                    camp.cpa < 80 ? 'text-emerald-400' : camp.cpa < 130 ? 'text-amber-400' : 'text-red-400'
                  }`}
                >
                  {fmtCurrency(camp.cpa)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-[var(--dash-muted)]">
                  {camp.conversions}
                </td>
                <td className="py-3 pl-3 pr-5 text-right font-mono text-[var(--dash-muted)]">
                  {camp.ctr}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
