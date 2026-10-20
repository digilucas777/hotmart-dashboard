'use client'

import { useEffect, useState } from 'react'
import { formatBRL, formatUSD } from '@/lib/utils'
import { fetchVendasPorDia, fetchVendasSummaryMulti, computeWidgetDataFromSummary, type SummaryRow } from '@/lib/vendas-aggregation'
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
 * Em 20/10/2026 Lucas pediu: (1) loading igual aos widgets personalizáveis (spinner +
 * "Carregando…", não só opacidade); (2) seção "Faturamento por Projeto" com um card por
 * projeto de origem, no mesmo estilo do "Por projeto" do combinado (BRL + USD + "BRL na
 * moeda original"), sem misturar BR com US. ES/FR/IT têm produtos duplicados também
 * linkados aqui (migrations 089/091); BR/US são os produtos originais, calculados por
 * diferença (total geral menos ES/FR/IT), já que não existe projeto separado pra eles.
 *
 * Bug corrigido (20/10/2026): eram 4 chamadas pesadas em paralelo (geral+ES+FR+IT),
 * cada uma disputando conexão/CPU com o resto da página — estourava statement_timeout
 * no Postgres. Trocado ES+FR+IT por UMA chamada só (get_vendas_summary_multi_v2, o
 * mesmo RPC já usado pelos combinados pra somar vários projetos de uma vez), reduzindo
 * de 4 pra 2 idas ao banco. Mesmo assim a chamada combinada (3 projetos, mais linhas)
 * ainda dava timeout ocasional quando disparada JUNTO com a do total geral — por isso
 * agora elas rodam em SEQUÊNCIA (não em paralelo): o total geral aparece primeiro,
 * sem esperar a de origem, e a seção "Faturamento por Projeto" tem loading e retry
 * próprios (3 tentativas com espera crescente), só pra ela.
 */
const RATE_CUTOFF = '2026-10-16'
const RATE_ATE_15 = 0.18
const RATE_DESDE_16 = 0.13

const ES_RECUPERACAO_ID = '540ef591-1601-4e22-84fc-46053f6758d7'
const FR_RECUPERACAO_ID = '85c399cb-7afe-4866-97fb-435cff63495d'
const IT_RECUPERACAO_ID = '5c1f9fb8-2924-45cb-8583-557cc8efe4a4'

function toSummary(rows: DiaRow[]): SummaryRow[] {
  const byKey = new Map<string, SummaryRow>()
  for (const r of rows) {
    const key = `${r.status}|${r.moeda}`
    const existing = byKey.get(key)
    if (existing) {
      existing.cnt += r.cnt
      existing.total += r.total
    } else {
      byKey.set(key, { status: r.status, moeda: r.moeda, cnt: r.cnt, total: r.total })
    }
  }
  return Array.from(byKey.values())
}

// Retry próprio (além do que fetchVendasSummaryMulti já faz) pra absorver timeout
// ocasional por contenção — 3 tentativas com espera crescente (0.8s, 2s).
async function fetchOrigensComRetry(ids: string[], from: Date, to: Date, signal: AbortSignal) {
  const delays = [0, 800, 2000]
  let lastErr: unknown
  for (const delay of delays) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay))
    if (signal.aborted) throw new Error('aborted')
    try {
      return await fetchVendasSummaryMulti(ids, from, to, signal)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

function approvedByMoeda(summary: SummaryRow[], moeda: 'BRL' | 'USD') {
  return summary
    .filter(r => r.status === 'approved' && r.moeda === moeda)
    .reduce((acc, r) => ({ cnt: acc.cnt + r.cnt, total: acc.total + r.total }), { cnt: 0, total: 0 })
}

function ProjetoFaturamentoCard({ nome, icone, summary, exchangeRate }: { nome: string; icone: string; summary: SummaryRow[]; exchangeRate: number }) {
  const faturamento = computeWidgetDataFromSummary(summary, 'total_converted', exchangeRate)
  const faturamentoBRL = computeWidgetDataFromSummary(summary, 'total_brl', exchangeRate)
  const faturamentoUSD = computeWidgetDataFromSummary(summary, 'total_usd', exchangeRate)
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-[#0b0d14] p-4">
      <p className="truncate text-sm font-black text-white">{icone} {nome}</p>
      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Faturamento</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-base font-black text-white">{faturamento?.kind === 'metric' ? faturamento.value : formatBRL(0)}</span>
          <span className="text-sm font-black text-emerald-300">
            {faturamentoUSD?.kind === 'metric' ? faturamentoUSD.value : formatUSD(0)} USD
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {faturamentoBRL?.kind === 'metric' ? faturamentoBRL.value : formatBRL(0)} BRL na moeda original
        </p>
      </div>
    </div>
  )
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
  const [geralRows, setGeralRows] = useState<DiaRow[]>([])
  const [esSummary, setEsSummary] = useState<SummaryRow[]>([])
  const [frSummary, setFrSummary] = useState<SummaryRow[]>([])
  const [itSummary, setItSummary] = useState<SummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOrigens, setLoadingOrigens] = useState(true)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setLoadingOrigens(true)
    setErrors([])

    // Sequencial, não paralelo: o total geral aparece assim que chega, sem esperar
    // a busca de origem (mais pesada, 3 projetos) — e as duas não disputam conexão
    // com o banco ao mesmo tempo, o que era a causa do timeout ocasional.
    fetchVendasPorDia(projectId, from, to, controller.signal)
      .then(geral => {
        if (cancelled) return
        setGeralRows(geral)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error('[RecuperacaoComissaoCard] falha ao carregar total geral:', err)
        setErrors(prev => [...prev, `Total geral: ${err?.message ?? 'falha ao carregar'}`])
        setGeralRows([])
        setLoading(false)
      })

    fetchOrigensComRetry([ES_RECUPERACAO_ID, FR_RECUPERACAO_ID, IT_RECUPERACAO_ID], from, to, controller.signal)
      .then(origens => {
        if (cancelled) return
        setEsSummary(origens.filter(r => r.projeto_id === ES_RECUPERACAO_ID))
        setFrSummary(origens.filter(r => r.projeto_id === FR_RECUPERACAO_ID))
        setItSummary(origens.filter(r => r.projeto_id === IT_RECUPERACAO_ID))
        setLoadingOrigens(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error('[RecuperacaoComissaoCard] falha ao carregar faturamento por projeto:', err)
        setErrors(prev => [...prev, `Faturamento por Projeto (ES/FR/IT): ${err?.message ?? 'falha ao carregar'}`])
        setEsSummary([])
        setFrSummary([])
        setItSummary([])
        setLoadingOrigens(false)
      })

    return () => { cancelled = true; controller.abort() }
  }, [projectId, from.getTime(), to.getTime(), refreshKey])

  const toBRL = (r: DiaRow) => (r.moeda === 'USD' ? r.total * exchangeRate : r.total)

  const faturamentoAte15 = geralRows
    .filter(r => r.status === 'approved' && r.dia < RATE_CUTOFF)
    .reduce((sum, r) => sum + toBRL(r), 0)
  const faturamentoDesde16 = geralRows
    .filter(r => r.status === 'approved' && r.dia >= RATE_CUTOFF)
    .reduce((sum, r) => sum + toBRL(r), 0)

  const faturamentoTotal = faturamentoAte15 + faturamentoDesde16
  const faturamentoTotalUSD = exchangeRate > 0 ? faturamentoTotal / exchangeRate : 0
  const comissao18 = faturamentoAte15 * RATE_ATE_15
  const comissao18USD = exchangeRate > 0 ? comissao18 / exchangeRate : 0
  const comissao13 = faturamentoDesde16 * RATE_DESDE_16
  const comissao13USD = exchangeRate > 0 ? comissao13 / exchangeRate : 0

  const geralSummary = toSummary(geralRows)
  const geralBRL = approvedByMoeda(geralSummary, 'BRL')
  const geralUSD = approvedByMoeda(geralSummary, 'USD')
  const esBRL = approvedByMoeda(esSummary, 'BRL')
  const esUSD = approvedByMoeda(esSummary, 'USD')
  const frBRL = approvedByMoeda(frSummary, 'BRL')
  const frUSD = approvedByMoeda(frSummary, 'USD')
  const itBRL = approvedByMoeda(itSummary, 'BRL')
  const itUSD = approvedByMoeda(itSummary, 'USD')

  // BR e US "diretos" = produtos originais do Recuperação Geral, sem duplicata em
  // nenhum projeto de idioma — calculados por diferença (total geral menos ES/FR/IT),
  // já que não existe um projeto separado só pra eles. Nunca mistura moeda BRL com USD.
  const brSummary: SummaryRow[] = [{
    status: 'approved', moeda: 'BRL',
    cnt: Math.max(0, geralBRL.cnt - esBRL.cnt - frBRL.cnt - itBRL.cnt),
    total: Math.max(0, geralBRL.total - esBRL.total - frBRL.total - itBRL.total),
  }]
  const usSummary: SummaryRow[] = [{
    status: 'approved', moeda: 'USD',
    cnt: Math.max(0, geralUSD.cnt - esUSD.cnt - frUSD.cnt - itUSD.cnt),
    total: Math.max(0, geralUSD.total - esUSD.total - frUSD.total - itUSD.total),
  }]

  return (
    <div className="space-y-5">
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <p className="font-bold">Alguns dados não carregaram:</p>
          <ul className="mt-1 list-disc pl-4">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
      <div className="relative">
        {loading && (
          <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/30 backdrop-blur-[1px]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-white/50" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Carregando…</span>
          </div>
        )}
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
      </div>

      <div className="relative">
        {loadingOrigens && (
          <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/30 backdrop-blur-[1px]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-white/50" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Carregando…</span>
          </div>
        )}
        <p className="mb-3 text-sm font-black text-white">Faturamento por Projeto</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <ProjetoFaturamentoCard nome="Recuperação Espanhol" icone="🟡" summary={esSummary} exchangeRate={exchangeRate} />
          <ProjetoFaturamentoCard nome="Recuperação Francês+App" icone="🔵" summary={frSummary} exchangeRate={exchangeRate} />
          <ProjetoFaturamentoCard nome="Recuperação Italiano+App" icone="🟢" summary={itSummary} exchangeRate={exchangeRate} />
          <ProjetoFaturamentoCard nome="Recuperação BR" icone="🇧🇷" summary={brSummary} exchangeRate={exchangeRate} />
          <ProjetoFaturamentoCard nome="Recuperação US" icone="🇺🇸" summary={usSummary} exchangeRate={exchangeRate} />
        </div>
      </div>
    </div>
  )
}
