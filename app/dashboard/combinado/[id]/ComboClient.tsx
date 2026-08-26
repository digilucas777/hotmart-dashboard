'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, ChevronDown, LayoutGrid, Layers, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getPeriodRange, formatBRL, formatUSD } from '@/lib/utils'
import { fetchVendasSummary, fetchHotmartIdsForProjetos, computeWidgetDataFromSummary, type SummaryRow } from '@/lib/vendas-aggregation'
import type { DashboardCombo, Projeto, Venda, Period } from '@/lib/types'
import { PeriodFilter } from '@/components/dashboard/PeriodFilter'
import { SalesTable } from '@/components/dashboard/SalesTable'
import { ComboMetricCards } from '@/components/saas/ComboMetricCards'
import { CombineDashboardsModal } from '@/components/saas/CombineDashboardsModal'
import { Spinner } from '@/components/ui/Spinner'

export function ComboClient({ comboId }: { comboId: string }) {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [combo, setCombo] = useState<DashboardCombo | null>(null)
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [allProjetos, setAllProjetos] = useState<Projeto[]>([])
  const [notFound, setNotFound] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [outrosCombos, setOutrosCombos] = useState<DashboardCombo[]>([])
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [showComboSection, setShowComboSection] = useState(false)

  const [period, setPeriod] = useState<Period>('thisMonth')
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [customTo, setCustomTo] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [exchangeRate, setExchangeRate] = useState(5.0)
  const [summary, setSummary] = useState<SummaryRow[]>([])
  const [summaryByProjeto, setSummaryByProjeto] = useState<{ projetoId: string; summary: SummaryRow[] }[]>([])
  const [custosManualRaw, setCustosManualRaw] = useState<{ projeto_id: string; valor: number; moeda: string }[]>([])
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingCustos, setLoadingCustos] = useState(true)
  const [summaryError, setSummaryError] = useState(false)
  const [vendas, setVendas] = useState<Venda[]>([])
  const [loadingVendas, setLoadingVendas] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)

  const summaryAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    async function checkAccessAndLoad() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.role !== 'admin') { router.push('/dashboard'); return }

      const { data: comboRow, error: comboError } = await supabase
        .from('dashboard_combos')
        .select('*')
        .eq('id', comboId)
        .maybeSingle()
      if (comboError || !comboRow) { setNotFound(true); setAllowed(true); return }

      const comboData = comboRow as DashboardCombo
      setCombo(comboData)

      const { data: allProjetosData } = await supabase.from('projetos').select('*').order('nome')
      setAllProjetos((allProjetosData ?? []) as Projeto[])

      const { data: combosData } = await supabase.from('dashboard_combos').select('*').order('nome')
      setOutrosCombos((combosData ?? []) as DashboardCombo[])

      if (comboData.projeto_ids.length > 0) {
        const { data: projetosData } = await supabase
          .from('projetos')
          .select('*')
          .in('id', comboData.projeto_ids)
        setProjetos((projetosData ?? []) as Projeto[])
      }

      setAllowed(true)
    }
    void checkAccessAndLoad()
  }, [comboId, router])

  const customDateRange = useMemo(() => {
    if (period !== 'custom') return undefined
    const parseLocal = (s: string) => {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(y!, m! - 1, d!)
    }
    return {
      from: parseLocal(customFrom),
      to: new Date(parseLocal(customTo).getTime() + 86_400_000),
    }
  }, [period, customFrom, customTo])

  useEffect(() => {
    const toLocalDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const { from, to } = getPeriodRange(period, customDateRange)
    const fromStr = toLocalDate(from)
    const toStr = toLocalDate(new Date(to.getTime() - 1))
    fetch(`/api/exchange-rate?from=${fromStr}&to=${toStr}`)
      .then(r => r.json())
      .then((d: { rate: number }) => setExchangeRate(d.rate ?? 5.0))
      .catch(() => {})
  }, [period, customDateRange])

  const fetchAll = useCallback(async () => {
    if (!combo || combo.projeto_ids.length === 0) {
      setSummary([])
      setSummaryByProjeto([])
      setCustosManualRaw([])
      setVendas([])
      setLoadingSummary(false)
      setLoadingCustos(false)
      setLoadingVendas(false)
      return
    }

    summaryAbortRef.current?.abort()
    const controller = new AbortController()
    summaryAbortRef.current = controller

    const { from, to } = getPeriodRange(period, customDateRange)

    setLoadingSummary(true)
    setSummaryError(false)
    try {
      const results = await Promise.all(
        combo.projeto_ids.map(id => fetchVendasSummary(id, from, to, controller.signal)),
      )
      if (controller.signal.aborted) return
      setSummary(results.flat())
      setSummaryByProjeto(combo.projeto_ids.map((id, i) => ({ projetoId: id, summary: results[i] ?? [] })))
    } catch {
      if (!controller.signal.aborted) setSummaryError(true)
    } finally {
      if (!controller.signal.aborted) setLoadingSummary(false)
    }

    setLoadingCustos(true)
    try {
      const toLocalDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const fromDate = toLocalDate(from)
      const toDate = toLocalDate(new Date(to.getTime() - 1))
      const { data } = await supabase
        .from('custos_manuais')
        .select('valor, moeda, projeto_id')
        .in('projeto_id', combo.projeto_ids)
        .gte('data', fromDate)
        .lte('data', toDate)
      if (controller.signal.aborted) return
      setCustosManualRaw((data ?? []) as { valor: number; moeda: string; projeto_id: string }[])
    } finally {
      if (!controller.signal.aborted) setLoadingCustos(false)
    }

    setLoadingVendas(true)
    try {
      const hotmartIds = await fetchHotmartIdsForProjetos(combo.projeto_ids)
      if (hotmartIds.length === 0) {
        setVendas([])
      } else {
        const { data } = await supabase
          .from('vendas')
          .select('*')
          .in('hotmart_produto_id', hotmartIds)
          .gte('data_venda', from.toISOString())
          .lt('data_venda', to.toISOString())
          .order('data_venda', { ascending: false })
        setVendas((data ?? []) as Venda[])
      }
    } finally {
      setLoadingVendas(false)
      setLastUpdatedAt(new Date())
    }
  }, [combo, period, customDateRange])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  // Mesma fórmula de custoManualTotal/custoManualTotalUSD do DashboardClient
  // (dashboard individual), só que agrupada por projeto pra alimentar a seção
  // "Por projeto" e os cards de gasto/lucro combinados.
  const perProjeto = useMemo(() => {
    if (!combo) return []
    return combo.projeto_ids.map(id => {
      const nome = projetos.find(p => p.id === id)?.nome ?? id
      const projSummary = summaryByProjeto.find(s => s.projetoId === id)?.summary ?? []
      const custosDoProjeto = custosManualRaw.filter(r => r.projeto_id === id)
      const custoTotal = custosDoProjeto.reduce((sum, r) => sum + (r.moeda === 'BRL' ? r.valor : r.valor * exchangeRate), 0)
      const custoUSD = custosDoProjeto.filter(r => r.moeda === 'USD').reduce((sum, r) => sum + r.valor, 0)
      return { projetoId: id, nome, summary: projSummary, custoTotal, custoUSD }
    })
  }, [combo, projetos, summaryByProjeto, custosManualRaw, exchangeRate])

  const comboCustoTotal = useMemo(() => perProjeto.reduce((sum, p) => sum + p.custoTotal, 0), [perProjeto])
  const comboCustoUSD = useMemo(() => perProjeto.reduce((sum, p) => sum + p.custoUSD, 0), [perProjeto])

  async function handleRefresh() {
    setIsRefreshing(true)
    try {
      await fetchAll()
    } finally {
      setIsRefreshing(false)
    }
  }

  async function deleteCombo() {
    if (!combo) return
    setDeleting(true)
    const { error } = await supabase.from('dashboard_combos').delete().eq('id', combo.id)
    setDeleting(false)
    if (!error) router.push('/dashboard')
  }

  if (allowed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07080d]">
        <Spinner size={28} />
      </div>
    )
  }

  if (notFound || !combo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#07080d] text-white">
        <p className="text-sm text-slate-400">Combinação não encontrada.</p>
        <Link href="/dashboard" className="text-sm font-bold text-cyan-300">Voltar pra Meus Dashboards</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#07080d] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07080d]/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-slate-400 hover:text-white">
              <ArrowLeft size={17} />
            </Link>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Combinado</p>
              <h1 className="mt-1 truncate text-xl font-black sm:text-2xl">{combo.nome}</h1>
              <p className="mt-0.5 truncate text-xs text-slate-500">{projetos.map(p => p.nome).join(' + ')}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowSwitcher(prev => !prev)}
                title="Trocar dashboard"
                className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left shadow-md shadow-black/10 transition-colors hover:border-white/20"
              >
                <div className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg border border-violet-300/30 bg-gradient-to-br from-cyan-400/20 to-violet-500/25">
                  <Layers size={15} className="text-violet-100" />
                </div>
                <div className="min-w-0">
                  <p className="max-w-32 truncate text-xs font-extrabold text-white">{combo.nome}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300/80">Combinado ativo</p>
                </div>
                <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${showSwitcher ? 'rotate-180' : ''}`} />
              </button>

              {showSwitcher && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSwitcher(false)} />
                  <div className="absolute left-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-white/10 bg-[#0b0d14] p-2 shadow-2xl shadow-black/40 backdrop-blur-2xl">
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <LayoutGrid size={14} className="shrink-0 text-cyan-300" />
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-white">Dashboards</p>
                    </div>
                    <div className="max-h-72 space-y-1 overflow-y-auto overflow-x-hidden pr-1">
                      {allProjetos.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setShowSwitcher(false); router.push(`/dashboard/${p.id}`) }}
                          className="flex w-full min-w-0 items-center gap-3 rounded-2xl py-3 pl-2 pr-3 text-left text-slate-300 transition-all hover:bg-white/5 hover:text-white"
                        >
                          <div className="grid h-11 w-14 shrink-0 grid-cols-3 items-end gap-1 rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/15 to-violet-500/15 p-2">
                            <span className="h-4 rounded-full bg-cyan-300/75" />
                            <span className="h-7 rounded-full bg-violet-300/75" />
                            <span className="h-5 rounded-full bg-sky-200/75" />
                          </div>
                          <p className="truncate text-sm font-black">{p.nome}</p>
                        </button>
                      ))}
                    </div>

                    {outrosCombos.length > 0 && (
                      <>
                        <div className="mt-1 border-t border-white/10 pt-1">
                          <button
                            onClick={() => setShowComboSection(prev => !prev)}
                            className="flex w-full items-center justify-between gap-2 rounded-xl bg-gradient-to-r from-cyan-400/10 to-violet-500/10 px-3 py-2.5 text-left transition-colors hover:from-cyan-400/15 hover:to-violet-500/15"
                          >
                            <span className="flex items-center gap-2">
                              <Layers size={14} className="shrink-0 text-violet-300" />
                              <span className="text-xs font-black uppercase tracking-[0.14em] text-white">Combinados</span>
                              <span className="rounded-full bg-violet-400/20 px-1.5 py-0.5 text-[10px] font-black text-violet-200">
                                {outrosCombos.length}
                              </span>
                            </span>
                            <ChevronDown size={15} className={`shrink-0 text-violet-300 transition-transform ${showComboSection ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                        {showComboSection && (
                          <div className="max-h-72 space-y-1 overflow-y-auto overflow-x-hidden pr-1">
                            {outrosCombos.map(c => {
                              const active = c.id === comboId
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => {
                                    setShowSwitcher(false)
                                    if (!active) router.push(`/dashboard/combinado/${c.id}`)
                                  }}
                                  className={`flex w-full min-w-0 items-center gap-3 rounded-2xl border py-3 pl-2 pr-3 text-left transition-all ${
                                    active
                                      ? 'border-violet-300/30 bg-violet-400/10 text-white'
                                      : 'border-transparent text-slate-300 hover:border-violet-300/20 hover:bg-violet-400/5 hover:text-white'
                                  }`}
                                >
                                  <div className="flex h-11 w-14 shrink-0 items-center justify-center rounded-2xl border border-violet-300/30 bg-gradient-to-br from-cyan-400/25 to-violet-500/30">
                                    <Layers size={18} className="text-violet-100" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-black">{c.nome}</p>
                                    <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-200">
                                      Combinado · {c.projeto_ids.length} projeto(s)
                                    </p>
                                  </div>
                                  {active && <Check size={16} className="shrink-0 text-violet-300" />}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => void handleRefresh()}
              disabled={isRefreshing}
              title="Atualizar"
              className="flex shrink-0 items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-1.5 text-sm font-semibold text-white shadow-md shadow-cyan-500/15 transition-colors disabled:opacity-60"
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Atualizando...' : 'Atualizar'}
            </button>
            <button onClick={() => setShowEdit(true)} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-slate-300 hover:text-white" title="Editar">
              <Pencil size={16} />
            </button>
            <button onClick={() => setShowDeleteConfirm(true)} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-slate-400 hover:border-red-300/35 hover:text-red-200" title="Excluir">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          customFrom={customFrom}
          customTo={customTo}
          updatedAt={lastUpdatedAt}
          onCustomChange={(from, to) => { setCustomFrom(from); setCustomTo(to) }}
        />

        {summaryError ? (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Não foi possível carregar as métricas combinadas.{' '}
            <button onClick={() => void fetchAll()} className="font-bold underline">Tentar de novo</button>
          </div>
        ) : loadingSummary || loadingCustos ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]" />)}
          </div>
        ) : (
          <div className="mt-6">
            <ComboMetricCards summary={summary} exchangeRate={exchangeRate} custoTotal={comboCustoTotal} custoUSD={comboCustoUSD} />
          </div>
        )}

        <div className="mt-10">
          <h2 className="mb-4 text-lg font-black">Por projeto</h2>
          {loadingSummary || loadingCustos ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(combo.projeto_ids.length > 0 ? combo.projeto_ids : ['a', 'b', 'c']).map(id => (
                <div key={id} className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]" />
              ))}
            </div>
          ) : perProjeto.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum projeto nesta combinação.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {perProjeto.map(p => {
                const faturamento = computeWidgetDataFromSummary(p.summary, 'total_converted', exchangeRate)
                const faturamentoBRL = computeWidgetDataFromSummary(p.summary, 'total_brl', exchangeRate)
                const faturamentoUSD = computeWidgetDataFromSummary(p.summary, 'total_usd', exchangeRate)
                const lucro = computeWidgetDataFromSummary(p.summary, 'lucro', exchangeRate, p.custoTotal, p.custoUSD)
                const roas = computeWidgetDataFromSummary(p.summary, 'roas', exchangeRate, p.custoTotal, p.custoUSD)
                return (
                  <div key={p.projetoId} className="rounded-2xl border border-white/10 bg-[#0b0d14] p-5">
                    <p className="truncate text-sm font-black text-white">{p.nome}</p>

                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Faturamento</p>
                      <p className="mt-1 text-lg font-black text-white">{faturamento?.kind === 'metric' ? faturamento.value : '—'}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {faturamentoBRL?.kind === 'metric' ? faturamentoBRL.value : formatBRL(0)} BRL
                        {' + '}
                        {faturamentoUSD?.kind === 'metric' ? faturamentoUSD.value : formatUSD(0)} USD
                      </p>
                    </div>

                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gasto</p>
                      {p.custoTotal > 0 ? (
                        <>
                          <p className="mt-1 text-lg font-black text-white">{formatBRL(p.custoTotal)}</p>
                          {p.custoUSD > 0 && <p className="mt-0.5 text-xs text-slate-500">{formatUSD(p.custoUSD)} USD</p>}
                        </>
                      ) : (
                        <p className="mt-1 text-xs text-slate-500">Sem custo cadastrado</p>
                      )}
                    </div>

                    <div className="mt-3 border-t border-white/10 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lucro</p>
                      <p className="mt-1 text-lg font-black text-white">{lucro?.kind === 'metric' ? lucro.value : '—'}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{lucro?.kind === 'metric' ? lucro.subValue : ''}</p>
                    </div>

                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">ROAS</p>
                      <p className="mt-1 text-lg font-black text-white">{roas?.kind === 'metric' ? roas.value : '—'}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{roas?.kind === 'metric' ? roas.subValue : ''}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-10">
          <h2 className="mb-4 text-lg font-black">Transações</h2>
          {loadingVendas ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner size={24} />
            </div>
          ) : (
            <SalesTable vendas={vendas} exchangeRate={exchangeRate} initialStatusFilter="all" />
          )}
        </div>
      </main>

      {userId && (
        <CombineDashboardsModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          projetos={allProjetos}
          userId={userId}
          combo={combo}
          onSaved={updated => {
            setCombo(updated)
            setShowEdit(false)
            supabase.from('projetos').select('*').in('id', updated.projeto_ids).then(({ data }) => {
              setProjetos((data ?? []) as Projeto[])
            })
          }}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#0b0d14] p-6 shadow-2xl shadow-black/60">
            <h2 className="text-xl font-black">Excluir esta combinação?</h2>
            <p className="mt-2 text-sm text-slate-500">Isso não afeta os dashboards individuais, só remove o combinado &quot;{combo.nome}&quot;.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="h-12 flex-1 rounded-2xl border border-white/10 text-sm font-black text-slate-300 hover:text-white disabled:opacity-60">
                Cancelar
              </button>
              <button onClick={deleteCombo} disabled={deleting} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 text-sm font-black text-white disabled:opacity-60">
                {deleting && <Loader2 size={16} className="animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
