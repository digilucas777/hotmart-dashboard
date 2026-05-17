'use client'

import { Gauge } from 'lucide-react'

export function DashSpeedLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-500 to-violet-500 text-white shadow-[0_0_32px_rgba(0,212,255,0.32)]">
        <div className="absolute inset-0 rounded-2xl bg-white/10" />
        <Gauge size={20} className="relative" />
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="text-base font-black tracking-tight text-white">Dash Speed</p>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-200/60">
            Intelligence
          </p>
        </div>
      )}
    </div>
  )
}
