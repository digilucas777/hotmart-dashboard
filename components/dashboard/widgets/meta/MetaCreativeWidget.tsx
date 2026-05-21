'use client'

import { Play, Image as ImageIcon } from 'lucide-react'
import type { MetaCreativeResult } from '@/lib/meta-ads-mock'

const PALETTE = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']

export function MetaCreativeWidget({ title, data, isDemo = true }: { title: string; data: MetaCreativeResult; isDemo?: boolean }) {
  const sortLabel = data.sortBy === 'ctr' ? 'CTR' : 'ROAS'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--dash-faint)]">
            Meta Ads · Criativos por {sortLabel}
          </p>
          <p className="text-sm font-bold text-[var(--dash-text)]">{title}</p>
        </div>
        {isDemo && (
          <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-400/60">
            Demo
          </span>
        )}
      </div>

      {/* Creative rows */}
      <div className="flex-1 overflow-auto">
        {data.creatives.slice(0, 6).map((cr, i) => (
          <div
            key={cr.id}
            className="flex items-center gap-3 border-b border-white/[0.03] px-4 py-3 transition-colors hover:bg-white/[0.02]"
          >
            {/* Rank */}
            <span className="w-4 shrink-0 text-center text-xs font-black text-[var(--dash-faint)]">
              {i + 1}
            </span>

            {/* Thumbnail */}
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
              style={{
                background: `${PALETTE[i % PALETTE.length]}18`,
                border: `1px solid ${PALETTE[i % PALETTE.length]}28`,
              }}
            >
              {cr.adType === 'video' ? (
                <Play size={14} className="text-white/40" />
              ) : (
                <ImageIcon size={14} className="text-white/40" />
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[var(--dash-text)]">{cr.name}</p>
              <p className="text-[10px] text-[var(--dash-faint)]">
                {cr.adType === 'video' ? 'Vídeo' : 'Imagem'} · {(cr.impressions / 1000).toFixed(0)}k imp
              </p>
            </div>

            {/* Metrics */}
            <div className="flex shrink-0 items-center gap-4">
              <div className="text-right">
                <p className="text-xs font-bold text-[var(--dash-text)]">{cr.ctr.toFixed(1)}%</p>
                <p className="text-[9px] text-[var(--dash-faint)]">CTR</p>
              </div>
              <div className="text-right">
                <p
                  className={`text-xs font-bold ${
                    cr.roas >= 3 ? 'text-emerald-400' : cr.roas >= 2 ? 'text-amber-400' : 'text-red-400'
                  }`}
                >
                  {cr.roas.toFixed(1)}x
                </p>
                <p className="text-[9px] text-[var(--dash-faint)]">ROAS</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
