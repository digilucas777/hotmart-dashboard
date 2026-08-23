'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getPeriodRange } from '@/lib/utils'
import { fetchVendasSummary, fetchHotmartIdsForProjetos, type SummaryRow } from '@/lib/vendas-aggregation'
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
  const [loadingSummary, setLoadingSummary] = useState(true)
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
      setVendas([])
      setLoadingSummary(false)
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
    } catch {
      if (!controller.signal.aborted) setSummaryError(true)
    } finally {
      if (!controller.signal.aborted) setLoadingSummary(false)
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
        ) : loadingSummary ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]" />)}
          </div>
        ) : (
          <div className="mt-6">
            <ComboMetricCards summary={summary} exchangeRate={exchangeRate} />
          </div>
        )}

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
