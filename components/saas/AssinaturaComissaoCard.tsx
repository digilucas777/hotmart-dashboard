'use client'

import { formatBRL, formatUSD } from '@/lib/utils'
import type { SummaryRow } from '@/lib/vendas-aggregation'

/**
 * Card de comissão específico do combinado "Assinaturas Recorrentes (33%)" — pedido
 * explícito do Lucas em 16/10/2026: comissão de 33% sobre o Faturamento das
 * assinaturas recorrentes (Joyce ES/FR/IT), sem gasto de anúncio envolvido (ele não
 * paga tráfego por essas recorrências — o chefe assumiu o tráfego dos produtos e
 * ele criou esse combinado só pra acompanhar a comissão).
 *
 * Isolado de propósito do ComboMetricCards/HighlightCard "Comissão" (que calcula
 * 33% em cima do Lucro após gasto, e mostra "—" quando não há custo cadastrado) —
 * aquele card continua intacto para os outros combinados (Pedro/Ana/etc). Este é
 * renderizado só nesse combinado específico, via checagem de comboId no ComboClient.
 */
export function AssinaturaComissaoCard({
  summary,
  exchangeRate,
}: {
  summary: SummaryRow[]
  exchangeRate: number
}) {
  const approvedBRL = summary
    .filter(r => r.status === 'approved' && r.moeda === 'BRL')
    .reduce((sum, r) => sum + r.total, 0)
  const approvedUSD = summary
    .filter(r => r.status === 'approved' && r.moeda === 'USD')
    .reduce((sum, r) => sum + r.total, 0)
  const faturamento = approvedBRL + approvedUSD * exchangeRate
  const comissao = faturamento * 0.33
  const comissaoUSD = exchangeRate > 0 ? comissao / exchangeRate : 0

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="min-w-0 rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.06] p-4 sm:p-5">
        <p className="truncate text-xs font-bold uppercase tracking-wide text-cyan-200/70">Faturamento Assinaturas</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-lg font-black text-cyan-300 sm:text-xl lg:text-2xl xl:text-3xl">{formatBRL(faturamento)}</span>
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">Taxa: R$ {exchangeRate.toFixed(2)}/USD</p>
      </div>
      <div className="min-w-0 rounded-2xl border border-pink-400/25 bg-pink-400/[0.06] p-4 sm:p-5">
        <p className="truncate text-xs font-bold uppercase tracking-wide text-pink-200/70">Comissão (33%)</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-lg font-black text-pink-300 sm:text-xl lg:text-2xl xl:text-3xl">{formatBRL(comissao)}</span>
          <span className="text-sm font-black text-emerald-300 sm:text-base">{formatUSD(comissaoUSD)} USD</span>
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">33% de {formatBRL(faturamento)} — sem gasto de anúncio</p>
      </div>
    </div>
  )
}
