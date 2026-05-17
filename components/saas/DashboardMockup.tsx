'use client'

import { motion } from 'framer-motion'
import { Activity, BarChart3, Bot, CircleDollarSign, Target, Zap } from 'lucide-react'

const metrics = [
  { label: 'Receita', value: 'R$ 182k', icon: CircleDollarSign },
  { label: 'ROAS', value: '4.8x', icon: Target },
  { label: 'Leads', value: '12.409', icon: Activity },
  { label: 'CPA', value: 'R$ 18,72', icon: Zap },
]

export function DashboardMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
      className="relative mx-auto w-full max-w-5xl"
    >
      <div className="absolute -inset-6 rounded-[2rem] bg-cyan-400/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0d0f18]/90 p-3 shadow-2xl shadow-black/50 backdrop-blur-2xl">
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-black text-white">
            <BarChart3 size={18} />
            Dashboard Geral
          </div>
          <div className="hidden rounded-full bg-black/25 px-3 py-1 text-xs text-white/80 sm:block">
            Tempo real
          </div>
        </div>

        <div className="grid gap-3 pt-3 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {metrics.map(({ label, value, icon: Icon }, index) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + index * 0.06 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <Icon size={17} className="mb-3 text-cyan-300" />
                  <p className="text-[11px] text-slate-500">{label}</p>
                  <p className="mt-1 text-lg font-black text-white">{value}</p>
                </motion.div>
              ))}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">Linha do Tempo</p>
                  <p className="text-xs text-slate-500">Leads, receita e custo por canal</p>
                </div>
                <div className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
                  +28%
                </div>
              </div>
              <div className="relative h-48 overflow-hidden rounded-xl bg-[#090a10]">
                <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-violet-500/20 to-transparent" />
                <svg viewBox="0 0 600 190" className="h-full w-full" role="img" aria-label="Grafico de performance">
                  <path d="M0 150 C80 120 100 84 170 110 S280 150 350 82 470 40 600 68" fill="none" stroke="#00d4ff" strokeWidth="4" />
                  <path d="M0 165 C95 152 110 138 180 142 S300 96 370 118 500 144 600 84" fill="none" stroke="#a78bfa" strokeWidth="4" />
                  <path d="M0 150 C80 120 100 84 170 110 S280 150 350 82 470 40 600 68 L600 190 L0 190 Z" fill="url(#mockGlow)" opacity="0.34" />
                  <defs>
                    <linearGradient id="mockGlow" x1="0" x2="0" y1="0" y2="1">
                      <stop stopColor="#00d4ff" />
                      <stop offset="1" stopColor="#00d4ff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
                <Bot size={17} className="text-violet-300" />
                Automações
              </div>
              {['Relatório enviado ao cliente', 'Resumo de KPIs gerado', 'Alerta de queda no ROAS'].map(item => (
                <div key={item} className="mb-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
                  {item}
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="mb-5 text-sm font-bold text-white">Funil Geral</p>
              {['Impressões', 'Cliques', 'Leads', 'Vendas'].map((label, index) => (
                <div
                  key={label}
                  className="mx-auto mb-2 rounded-lg bg-gradient-to-r from-cyan-400 to-violet-400 py-2 text-center text-xs font-bold text-white"
                  style={{ width: `${100 - index * 15}%` }}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
