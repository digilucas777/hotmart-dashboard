'use client'

import { computeWidgetDataFromSummary, type SummaryRow } from '@/lib/vendas-aggregation'
import type { WidgetDataSource } from '@/lib/types'

// Só métricas de vendas (sem ROAS/lucro/CPA, que dependem de gasto com
// anúncio por projeto — fora de escopo desta feature, ver spec).
const CARDS: { source: WidgetDataSource; title: string }[] = [
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

export function ComboMetricCards({ summary, exchangeRate }: { summary: SummaryRow[]; exchangeRate: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {CARDS.map(({ source, title }) => {
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
    </div>
  )
}
