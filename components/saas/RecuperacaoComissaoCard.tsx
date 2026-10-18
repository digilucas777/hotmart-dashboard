'use client'

import { formatBRL, formatUSD } from '@/lib/utils'
import type { SummaryRow } from '@/lib/vendas-aggregation'

/**
 * Card de comissão do projeto "⭐RECUPERAÇÃO GERAL [BR E US]" — pedido explícito do
 * Lucas em 18/10/2026: a partir de vendas de 16/10/2026 em diante, a comissão de
 * recuperação (WhatsApp/e-mail, todas as línguas) passa a ser 13% do Faturamento.
 *
 * Mesmo padrão isolado do AssinaturaComissaoCard — não mexe no ComboMetricCards
 * nem em outro card de comissão existente.
 */
export function RecuperacaoComissaoCard({
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
  const comissao = faturamento * 0.13
  const comissaoUSD = exchangeRate > 0 ? comissao / exchangeRate : 0

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="min-w-0 rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.06] p-4 sm:p-5">
        <p className="truncate text-xs font-bold uppercase tracking-wide text-cyan-200/70">Faturamento Recuperação</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-lg font-black text-cyan-300 sm:text-xl lg:text-2xl xl:text-3xl">{formatBRL(faturamento)}</span>
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">Taxa: R$ {exchangeRate.toFixed(2)}/USD</p>
      </div>
      <div className="min-w-0 rounded-2xl border border-pink-400/25 bg-pink-400/[0.06] p-4 sm:p-5">
        <p className="truncate text-xs font-bold uppercase tracking-wide text-pink-200/70">Comissão (13%)</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-lg font-black text-pink-300 sm:text-xl lg:text-2xl xl:text-3xl">{formatBRL(comissao)}</span>
          <span className="text-sm font-black text-emerald-300 sm:text-base">{formatUSD(comissaoUSD)} USD</span>
        </div>
        <p className="mt-1 truncate text-xs text-slate-500">13% de {formatBRL(faturamento)} — a partir de 16/10/2026</p>
      </div>
    </div>
  )
}
