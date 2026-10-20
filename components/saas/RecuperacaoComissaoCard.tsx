'use client'

import { useEffect, useState } from 'react'
import { formatBRL, formatUSD } from '@/lib/utils'
import { fetchVendasPorDia } from '@/lib/vendas-aggregation'
import type { DiaRow } from '@/lib/types'

/**
 * Cards de comissão do projeto "⭐RECUPERAÇÃO GERAL [BR E US]" — pedido explícito do
 * Lucas em 18/10/2026: até 15/10/2026 a comissão de recuperação era 18%; a partir de
 * vendas de 16/10/2026 em diante passa a ser 13%. São dois cards SEPARADOS e cada um
 * só soma vendas do seu próprio período (o de 18% nunca soma venda de 16/10 em diante,
 * o de 13% nunca soma venda anterior a 16/10) — não é uma taxa combinada num total único.
 *
 * Usa get_vendas_por_dia (não o resumo plano do período) pra poder filtrar por dia.
 * Substitui o widget genérico "Minha Comissão (18%)" (data_source "commission",
 * compartilhado com outros gestores) só nesse projeto — não mexe no data_source
 * compartilhado, que continua intacto pra quem mais usa esse tipo de widget.
 *
 * Em 20/10/2026 Lucas pediu: (1) esses cards também mostrarem "carregando" ao clicar
 * em Atualizar (antes ficavam parados sem nenhum feedback visual); (2) um card por
 * projeto de origem que é somado no total do Recuperação Geral (ES/FR/IT têm produtos
 * duplicados também linkados aqui — ver migrations 089/091 — então o total daqui é a
 * soma desses projetos de idioma + os produtos BR/US originais).
 */
const RATE_CUTOFF = '2026-10-16'
const RATE_ATE_15 = 0.18
const RATE_DESDE_16 = 0.13

const ES_RECUPERACAO_ID = '540ef591-1601-4e22-84fc-46053f6758d7'
const FR_RECUPERACAO_ID = '85c399cb-7afe-4866-97fb-435cff63495d'
const IT_RECUPERACAO_ID = '5c1f9fb8-2924-45cb-8583-557cc8efe4a4'

function sumApproved(rows: DiaRow[], exchangeRate: number, pred: (dia: string) => boolean) {
  return rows
    .filter(r => r.status === 'approved' && pred(r.dia))
    .reduce((sum, r) => sum + (r.moeda === 'USD' ? r.total * exchangeRate : r.total), 0)
}

export function RecuperacaoComissaoCard({
  projectId,
  from,
  to,
  exchangeRate,
  refreshKey,
}: {
  projectId: string
  from: Date
  to: Date
  exchangeRate: number
  refreshKey?: number
}) {
  const [rows, setRows] = useState<DiaRow[]>([])
  const [origemRows, setOrigemRows] = useState<{ es: DiaRow[]; fr: DiaRow[]; it: DiaRow[] }>({ es: [], fr: [], it: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    Promise.all([
      fetchVendasPorDia(projectId, from, to, controller.signal),
      fetchVendasPorDia(ES_RECUPERACAO_ID, from, to, controller.signal),
      fetchVendasPorDia(FR_RECUPERACAO_ID, from, to, controller.signal),
      fetchVendasPorDia(IT_RECUPERACAO_ID, from, to, controller.signal),
    ])
      .then(([geral, es, fr, it]) => {
        if (cancelled) return
        setRows(geral)
        setOrigemRows({ es, fr, it })
      })
      .catch(() => {
        if (cancelled) return
        setRows([])
        setOrigemRows({ es: [], fr: [], it: [] })
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true; controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, from.getTime(), to.getTime(), refreshKey])

  const toBRL = (r: DiaRow) => (r.moeda === 'USD' ? r.total * exchangeRate : r.total)

  const faturamentoAte15 = rows
    .filter(r => r.status === 'approved' && r.dia < RATE_CUTOFF)
    .reduce((sum, r) => sum + toBRL(r), 0)
  const faturamentoDesde16 = rows
    .filter(r => r.status === 'approved' && r.dia >= RATE_CUTOFF)
    .reduce((sum, r) => sum + toBRL(r), 0)

  const faturamentoTotal = faturamentoAte15 + faturamentoDesde16
  const faturamentoTotalUSD = exchangeRate > 0 ? faturamentoTotal / exchangeRate : 0
  const comissao18 = faturamentoAte15 * RATE_ATE_15
  const comissao18USD = exchangeRate > 0 ? comissao18 / exchangeRate : 0
  const comissao13 = faturamentoDesde16 * RATE_DESDE_16
  const comissao13USD = exchangeRate > 0 ? comissao13 / exchangeRate : 0

  const faturamentoES = sumApproved(origemRows.es, exchangeRate, () => true)
  const faturamentoFR = sumApproved(origemRows.fr, exchangeRate, () => true)
  const faturamentoIT = sumApproved(origemRows.it, exchangeRate, () => true)
  // "BR/US direto" = o resto do total que não veio de nenhum projeto de idioma acima
  // (produtos originais do Recuperação Geral, sem duplicata em nenhum projeto ES/FR/IT).
  const faturamentoBrUs = Math.max(0, faturamentoTotal - faturamentoES - faturamentoFR - faturamentoIT)

  return (
    <div className={`space-y-3 transition-opacity duration-300 ${loading ? 'pointer-events-none opacity-50' : ''}`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="min-w-0 rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.06] p-4 sm:p-5">
          <p className="truncate text-xs font-bold uppercase tracking-wide text-cyan-200/70">Total Convertido (BRL)</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-lg font-black text-cyan-300 sm:text-xl lg:text-2xl xl:text-3xl">{formatBRL(faturamentoTotal)}</span>
            <span className="text-sm font-black text-emerald-300 sm:text-base">{formatUSD(faturamentoTotalUSD)} USD</span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">Taxa: R$ {exchangeRate.toFixed(2)}/USD</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-pink-400/25 bg-pink-400/[0.06] p-4 sm:p-5">
          <p className="truncate text-xs font-bold uppercase tracking-wide text-pink-200/70">Minha Comissão (13%)</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-lg font-black text-pink-300 sm:text-xl lg:text-2xl xl:text-3xl">{formatBRL(comissao13)}</span>
            <span className="text-sm font-black text-emerald-300 sm:text-base">{formatUSD(comissao13USD)} USD</span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">13% de {formatBRL(faturamentoDesde16)}</p>
          <p className="mt-1 text-[11px] font-semibold text-pink-200/80">Válido a partir de 16/10/2026 — não soma vendas anteriores</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4 sm:p-5">
          <p className="truncate text-xs font-bold uppercase tracking-wide text-amber-200/70">Minha Comissão (18%)</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-lg font-black text-amber-300 sm:text-xl lg:text-2xl xl:text-3xl">{formatBRL(comissao18)}</span>
            <span className="text-sm font-black text-emerald-300 sm:text-base">{formatUSD(comissao18USD)} USD</span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">18% de {formatBRL(faturamentoAte15)}</p>
          <p className="mt-1 text-[11px] font-semibold text-amber-200/80">Válido só até 15/10/2026 — não soma vendas de 16/10 em diante</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">De onde vem o faturamento acima</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">🟡 Recuperação Espanhol</p>
            <p className="mt-1 text-base font-black text-slate-100">{formatBRL(faturamentoES)}</p>
          </div>
          <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">🔵 Recuperação Francês+App</p>
            <p className="mt-1 text-base font-black text-slate-100">{formatBRL(faturamentoFR)}</p>
          </div>
          <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">🟢 Recuperação Italiano+App</p>
            <p className="mt-1 text-base font-black text-slate-100">{formatBRL(faturamentoIT)}</p>
          </div>
          <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">⭐ BR/US (produtos originais)</p>
            <p className="mt-1 text-base font-black text-slate-100">{formatBRL(faturamentoBrUs)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
