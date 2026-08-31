'use client'

import { computeWidgetDataFromSummary, type SummaryRow } from '@/lib/vendas-aggregation'
import { formatBRL, formatUSD } from '@/lib/utils'
import type { WidgetDataSource } from '@/lib/types'

// Métricas secundárias — contexto de vendas, sem destaque visual (não
// dependem de gasto por projeto).
const SALES_CARDS: { source: WidgetDataSource; title: string }[] = [
  { source: 'total_brl', title: 'Faturamento BRL' },
  { source: 'total_usd', title: 'Faturamento USD' },
  { source: 'sales_count', title: 'Vendas Aprovadas' },
  { source: 'avg_ticket', title: 'Ticket Médio' },
  { source: 'pending_count', title: 'Pendentes' },
  { source: 'refunds_count', title: 'Reembolsos' },
  { source: 'chargebacks_count', title: 'Chargebacks' },
  { source: 'disputed_count', title: 'Reclamadas' },
  { source: 'cancelled_count', title: 'Canceladas' },
  { source: 'approval_rate', title: 'Taxa de Aprovação' },
  { source: 'refund_rate', title: 'Taxa de Reembolso' },
]

// As 4 métricas que realmente importam num combinado de tráfego (faturamento,
// gasto, lucro, ROAS) ganham cor e destaque próprios — em vez de se
// misturarem visualmente com "Chargebacks"/"Ticket Médio" etc.
const HIGHLIGHT_THEME = {
  faturamento: { border: 'border-cyan-400/25', bg: 'bg-cyan-400/[0.06]', text: 'text-cyan-300', label: 'text-cyan-200/70' },
  gasto: { border: 'border-amber-400/25', bg: 'bg-amber-400/[0.06]', text: 'text-amber-300', label: 'text-amber-200/70' },
  lucroPositivo: { border: 'border-emerald-400/25', bg: 'bg-emerald-400/[0.06]', text: 'text-emerald-300', label: 'text-emerald-200/70' },
  lucroNegativo: { border: 'border-rose-400/25', bg: 'bg-rose-400/[0.06]', text: 'text-rose-300', label: 'text-rose-200/70' },
  roas: { border: 'border-violet-400/25', bg: 'bg-violet-400/[0.06]', text: 'text-violet-300', label: 'text-violet-200/70' },
  comissao: { border: 'border-pink-400/25', bg: 'bg-pink-400/[0.06]', text: 'text-pink-300', label: 'text-pink-200/70' },
} as const

function HighlightCard({
  theme,
  title,
  value,
  subValue,
}: {
  theme: typeof HIGHLIGHT_THEME[keyof typeof HIGHLIGHT_THEME]
  title: string
  value: string
  subValue: string
}) {
  return (
    <div className={`min-w-0 rounded-2xl border ${theme.border} ${theme.bg} p-4 sm:p-5`}>
      <p className={`truncate text-xs font-bold uppercase tracking-wide ${theme.label}`}>{title}</p>
      {/* Sem break-words de propósito: "R$ 120.796,80" não tem espaço a não ser
          depois do "R$", então um wrap forçado cortava no meio do número
          ("120.796,8" / "0"). Sem break-words, o navegador só quebra em
          espaço — na pior das hipóteses "R$" cai numa linha e o valor na
          outra, nunca corta um dígito ao meio. */}
      <p className={`mt-2 text-lg font-black sm:text-xl lg:text-2xl xl:text-3xl ${theme.text}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{subValue}</p>
    </div>
  )
}

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
  const faturamento = computeWidgetDataFromSummary(summary, 'total_converted', exchangeRate)
  const lucro = computeWidgetDataFromSummary(summary, 'lucro', exchangeRate, custoTotal, custoUSD)
  const roas = computeWidgetDataFromSummary(summary, 'roas', exchangeRate, custoTotal, custoUSD)

  // "lucro" cai pra faturamento bruto (sem custo cadastrado) quando custoTotal<=0
  // — nesse caso não é lucro de verdade, então não calcula comissão sobre ele.
  const lucroValor = custoTotal > 0 && lucro?.kind === 'metric' ? (lucro.numericValue ?? 0) : 0
  const lucroTheme = lucroValor < 0 ? HIGHLIGHT_THEME.lucroNegativo : HIGHLIGHT_THEME.lucroPositivo
  const comissaoBRL = lucroValor > 0 ? lucroValor * 0.33 : 0
  const comissaoUSD = exchangeRate > 0 ? comissaoBRL / exchangeRate : 0

  return (
    <div className="space-y-5">
      {/* Métricas-chave: faturamento, gasto, lucro, ROAS, comissão — com destaque de cor.
          5 colunas só a partir de xl: com lg:grid-cols-5 o card ficava mais estreito
          bem na hora em que a fonte também crescia (lg:text-3xl), as duas mudanças
          batendo de frente e estourando números grandes tipo "R$ 120.796,80". */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {faturamento && faturamento.kind === 'metric' && (
          <HighlightCard theme={HIGHLIGHT_THEME.faturamento} title="Faturamento" value={faturamento.value} subValue={faturamento.subValue} />
        )}
        <HighlightCard
          theme={HIGHLIGHT_THEME.gasto}
          title="Gasto Total"
          value={custoTotal > 0 ? formatBRL(custoTotal) : '—'}
          subValue={custoUSD > 0 ? `${formatUSD(custoUSD)} USD` : custoTotal > 0 ? 'Custo em BRL' : 'Sem custo cadastrado'}
        />
        {lucro && lucro.kind === 'metric' && (
          <HighlightCard theme={lucroTheme} title="Lucro" value={lucro.value} subValue={lucro.subValue} />
        )}
        {roas && roas.kind === 'metric' && (
          <HighlightCard theme={HIGHLIGHT_THEME.roas} title="ROAS" value={roas.value} subValue={roas.subValue} />
        )}
        <HighlightCard
          theme={HIGHLIGHT_THEME.comissao}
          title="Comissão"
          value={comissaoBRL > 0 ? formatBRL(comissaoBRL) : '—'}
          subValue={comissaoBRL > 0 ? `33% · ${formatUSD(comissaoUSD)} USD` : lucroValor < 0 ? 'Sem comissão — lucro negativo' : 'Sem custo cadastrado'}
        />
      </div>

      {/* Métricas de contexto — sem destaque, grid neutro */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {SALES_CARDS.map(({ source, title }) => {
          const data = computeWidgetDataFromSummary(summary, source, exchangeRate)
          if (!data || data.kind !== 'metric') return null
          return (
            <div key={source} className="min-w-0 rounded-2xl border border-white/10 bg-[#0b0d14] p-4 sm:p-5">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
              <p className="mt-2 break-words text-lg font-black text-white sm:text-2xl">{data.value}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{data.subValue}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
