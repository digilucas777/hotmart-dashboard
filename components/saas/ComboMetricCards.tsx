'use client'

import { computeWidgetDataFromSummary, type SummaryRow } from '@/lib/vendas-aggregation'
import type { WidgetDataSource } from '@/lib/types'

// Métricas de vendas (sem depender de gasto por projeto).
const SALES_CARDS: { source: WidgetDataSource; title: string }[] = [
  { source: 'total_converted', title: 'Total Convertido' },
  { source: 'total_brl', title: 'Faturamento BRL' },
  { source: 'total_usd', title: 'Faturamento USD' },
  { source: 'sales_count', title: 'Vendas Aprovadas' },
  { source: 'commission', title: 'Comissão' },
  { source: 'avg_ticket', title: 'Ticket Médio' },
  { source: 'pending_count', title: 'Pendentes' },
  { source: 'refunds_count', title: 'Reembolsos' },
  { source: 'chargebacks_count', title: 'Chargebacks' },
  { source: 'disputed_count', title: 'Reclamadas' },
  { source: 'cancelled_count', title: 'Canceladas' },
  { source: 'approval_rate', title: 'Taxa de Aprovação' },
]

// Métricas que dependem do gasto combinado (custoTotal/custoUSD somados de
// todos os projetos do combo).
const COST_CARDS: { source: WidgetDataSource; title: string }[] = [
  { source: 'lucro', title: 'Lucro' },
]

export function ComboMetricCards({
  summary,
  exchangeRate,
  custoTotal = 0,
  custoUSD = 0,
}: {
  summary: SummaryRow[]
  exchangeRate: number
  custoTotal?: number
  custoUSD?: number
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {SALES_CARDS.map(({ source, title }) => {
        const data = computeWidgetDataFromSummary(summary, source, exchangeRate)
        if (!data || data.kind !== 'metric') return null
        return (
          <div key={source} className="rounded-2xl border border-white/10 bg-[#0b0d14] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
            <p className="mt-2 text-2xl font-black text-white">{data.value}</p>
            <p className="mt-1 text-xs text-slate-500">{data.subValue}</p>
          </div>
        )
      })}

      <div className="rounded-2xl border border-white/10 bg-[#0b0d14] p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gasto Total</p>
        <p className="mt-2 text-2xl font-black text-white">
          {custoTotal > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(custoTotal) : '—'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {custoUSD > 0
            ? `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(custoUSD)} USD`
            : custoTotal > 0
              ? 'Custo em BRL'
              : 'Sem custo cadastrado'}
        </p>
      </div>

      {COST_CARDS.map(({ source, title }) => {
        const data = computeWidgetDataFromSummary(summary, source, exchangeRate, custoTotal, custoUSD)
        if (!data || data.kind !== 'metric') return null
        return (
          <div key={source} className="rounded-2xl border border-white/10 bg-[#0b0d14] p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
            <p className="mt-2 text-2xl font-black text-white">{data.value}</p>
            <p className="mt-1 text-xs text-slate-500">{data.subValue}</p>
          </div>
        )
      })}
    </div>
  )
}
