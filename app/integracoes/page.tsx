'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  BarChart3,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Image,
  Link2,
  Loader2,
  MousePointerClick,
  Plug,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
  Unlink,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Projeto } from '@/lib/types'

type Connection = {
  id: string
  meta_user_id: string | null
  meta_user_name: string | null
  status: string
}

type AdAccount = {
  id: string
  name: string
  currency?: string
  account_status?: number
}

type BizManager = {
  id: string
  name: string
  ad_accounts: AdAccount[]
}

type ProjectAccount = {
  account_id: string
  account_name: string | null
  bm_id: string | null
  bm_name: string | null
}

const metaMetrics = [
  'Gasto total', 'Impressões', 'Alcance', 'Frequência',
  'Cliques no link', 'CTR', 'CPC', 'CPM', 'Leads',
  'Custo por lead', 'Conversões', 'Custo por compra', 'ROAS', 'Receita atribuída',
]

const features = [
  { icon: Boxes,    title: 'Múltiplas contas',        text: 'Acesse várias contas de anúncios na mesma dashboard e visualize métricas consolidadas.' },
  { icon: BarChart3, title: 'Funil Adaptável',         text: 'Funil dinâmico com custo e taxa de conversão entre cada etapa.' },
  { icon: Link2,    title: 'Rastreio de UTMs',         text: 'Rastreie a origem das conversões e analise campanhas que trouxeram mais resultado.' },
  { icon: Clock3,   title: 'Atualizada em tempo real', text: 'Acompanhe métricas sem depender de novos relatórios a cada real investido.' },
  { icon: Image,    title: 'Imagem dos criativos',     text: 'Exiba criativos destaque com CTR, custo por resultado e outras métricas.' },
]

function accountStatusLabel(status?: number): string {
  if (status === 1) return 'Ativa'
  if (status === 2) return 'Desativada'
  if (status === 3) return 'Sem pagamento'
  return 'Desconhecida'
}

function IntegracoesContent() {
  const searchParams = useSearchParams()
  const metaParam = searchParams.get('meta')
  const metaError = metaParam === 'error' ? 'Falha na conexão com Meta Ads.' : searchParams.get('meta_error')
  const metaJustConnected = metaParam === 'success' || metaParam === 'connected'

  const [connection, setConnection] = useState<Connection | null | undefined>(undefined)
  const [businesses, setBusinesses] = useState<BizManager[]>([])
  const [selectedBmId, setSelectedBmId] = useState<string | null>(null)
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set())
  const [projectAccounts, setProjectAccounts] = useState<ProjectAccount[]>([])
  const [dashboards, setDashboards] = useState<Projeto[]>([])
  const [selectedDashboardId, setSelectedDashboardId] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [unlinkConfirm, setUnlinkConfirm] = useState(false)
  const [unlinking, setUnlinking] = useState(false)

  const loadProjectAccounts = useCallback(async (projetoId: string) => {
    if (!projetoId) { setProjectAccounts([]); setSelectedAccountIds(new Set()); return }
    const { data } = await supabase
      .from('meta_project_accounts')
      .select('account_id, account_name, bm_id, bm_name')
      .eq('projeto_id', projetoId)
      .order('created_at', { ascending: true })
    const accounts = (data ?? []) as ProjectAccount[]
    setProjectAccounts(accounts)
    setSelectedAccountIds(new Set(accounts.map(a => a.account_id)))
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: authData }, dashboardsRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('projetos').select('*').order('data_criacao', { ascending: false }),
    ])

    const dashboardList = (dashboardsRes.data ?? []) as Projeto[]
    setDashboards(dashboardList)

    const user = authData.user
    if (user) {
      const { data: conn } = await supabase
        .from('meta_connections')
        .select('id, meta_user_id, meta_user_name, status')
        .eq('user_id', user.id)
        .eq('status', 'connected')
        .maybeSingle()
      setConnection((conn as Connection | null) ?? null)
    } else {
      setConnection(null)
    }

    const firstProjectId = dashboardList[0]?.id ?? ''
    setSelectedDashboardId(firstProjectId)
    setLoading(false)
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  useEffect(() => {
    if (selectedDashboardId) void loadProjectAccounts(selectedDashboardId)
  }, [selectedDashboardId, loadProjectAccounts])

  useEffect(() => {
    if (metaJustConnected || metaError) {
      const t = setTimeout(() => {
        window.history.replaceState({}, '', '/integracoes')
      }, 100)
      return () => clearTimeout(t)
    }
  }, [metaJustConnected, metaError])

  function toggleAccount(accId: string) {
    setSelectedAccountIds(prev => {
      const next = new Set(prev)
      if (next.has(accId)) next.delete(accId)
      else next.add(accId)
      return next
    })
  }

  async function syncAccounts() {
    console.log('[SYNC] iniciando...')
    setSyncing(true)
    try {
      const res = await fetch('/api/meta/accounts', { cache: 'no-store' })
      console.log('[SYNC] status:', res.status)
      const data = await res.json()
      console.log('[SYNC] data:', data)
      if (res.ok) {
        setBusinesses(data.businesses ?? [])
        if (data.businesses?.[0]) setSelectedBmId(data.businesses[0].id)
      }
    } catch (err) {
      console.error('[SYNC] erro:', err)
    }
    setSyncing(false)
  }

  async function disconnect() {
    if (!connection) return
    setDisconnecting(true)
    await supabase.from('meta_connections').delete().eq('id', connection.id)
    setConnection(null)
    setBusinesses([])
    setSelectedBmId(null)
    setSelectedAccountIds(new Set())
    setProjectAccounts([])
    setDisconnecting(false)
  }

  async function saveLink() {
    if (!connection || !selectedDashboardId) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const bm = businesses.find(b => b.id === selectedBmId)

    const toInsert = Array.from(selectedAccountIds).map(accId => {
      const acc = businesses.flatMap(b => b.ad_accounts).find(a => a.id === accId)
      const existing = projectAccounts.find(pa => pa.account_id === accId)
      return {
        user_id: user.id,
        projeto_id: selectedDashboardId,
        account_id: accId,
        account_name: acc?.name ?? existing?.account_name ?? null,
        bm_id: bm?.id ?? existing?.bm_id ?? null,
        bm_name: bm?.name ?? existing?.bm_name ?? null,
      }
    })

    await supabase.from('meta_project_accounts').delete().eq('projeto_id', selectedDashboardId)
    if (toInsert.length > 0) {
      await supabase.from('meta_project_accounts').insert(toInsert)
    }

    setSaveSuccess(true)
    await loadProjectAccounts(selectedDashboardId)
    setSaving(false)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  async function unlinkAllAccounts() {
    if (!selectedDashboardId) return
    setUnlinking(true)
    await supabase.from('meta_project_accounts').delete().eq('projeto_id', selectedDashboardId)
    await loadProjectAccounts(selectedDashboardId)
    setUnlinkConfirm(false)
    setUnlinking(false)
  }

  const connected = connection?.status === 'connected'
  const selectedBm = businesses.find(b => b.id === selectedBmId)
  const pageLoading = connection === undefined || loading

  return (
    <div className="min-h-screen bg-[var(--dash-bg)] text-[var(--dash-text)]">
      {/* Header */}
      <header className="border-b border-[var(--dash-border)] bg-[var(--dash-panel-strong)]/90 backdrop-blur-2xl">
        <div className="mx-auto flex min-h-16 max-w-[1400px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 text-white shadow-[0_0_28px_rgba(0,212,255,0.24)]">
              <Plug size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--dash-faint)]">Integrações</p>
              <h1 className="text-xl font-black">Meta Ads</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-10">
        {/* Alerts */}
        {(metaJustConnected || metaError) && (
          <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-bold ${
            metaJustConnected
              ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'
              : 'border-red-400/20 bg-red-500/10 text-red-200'
          }`}>
            {metaJustConnected ? 'Meta conectado. Sincronize as contas e vincule ao dashboard.' : `Falha na conexão Meta: ${metaError}`}
          </div>
        )}
        {saveSuccess && (
          <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-200">
            Vínculo salvo com sucesso!
          </div>
        )}

        {/* Intro grid */}
        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-7 shadow-[var(--dash-shadow)]">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-200">
              <ShieldCheck size={14} />
              OAuth Meta real
            </div>
            <h2 className="text-3xl font-black">Conecte Facebook, BMs e contas por dashboard.</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--dash-muted)]">
              Conecte o Facebook, escolha o Business Manager, selecione as contas de anúncio (múltiplas) e vincule ao dashboard do cliente.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {['Facebook OAuth', 'Business Managers', 'Múltiplas contas', 'Vínculo por dashboard', 'Métricas Meta Ads', 'Criativos destaque'].map((item, i) => (
                <div key={item} className="flex items-center gap-2 rounded-2xl border border-[var(--dash-border)] bg-white/5 px-4 py-3 text-sm font-bold">
                  <CheckCircle2 size={15} className={i < 4 ? 'text-cyan-300' : 'text-violet-300'} />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-7 shadow-[var(--dash-shadow)]">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-black text-cyan-200 flex items-center gap-2"><TrendingUp size={18} /> Principais métricas</p>
              {pageLoading && <Loader2 size={18} className="animate-spin text-cyan-200" />}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
              {metaMetrics.map(metric => (
                <div key={metric} className="rounded-2xl border border-[var(--dash-border)] bg-white/5 px-4 py-3 text-sm font-semibold">
                  {metric}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Connection status */}
        <section className="mt-8">
          {pageLoading ? (
            <div className="flex items-center gap-3 rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-6">
              <Loader2 size={20} className="animate-spin text-[var(--dash-faint)]" />
              <span className="text-sm text-[var(--dash-muted)]">Verificando conexão…</span>
            </div>
          ) : connected ? (
            <div className="rounded-[2rem] border border-emerald-400/20 bg-emerald-400/[0.06] p-6 shadow-[var(--dash-shadow)]">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-400">Meta Ads conectado</p>
                    <p className="mt-0.5 text-sm font-semibold text-[var(--dash-text)]">
                      {connection.meta_user_name ?? connection.meta_user_id ?? 'Usuário Meta'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href="/api/meta/oauth/start"
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--dash-border)] bg-white/5 px-4 py-2.5 text-sm font-bold text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text)]"
                  >
                    <RefreshCw size={14} />
                    Reconectar
                  </a>
                  <button
                    onClick={disconnect}
                    disabled={disconnecting}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {disconnecting ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />}
                    Desconectar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-dashed border-[var(--dash-border)] bg-[var(--dash-panel)] p-6">
              <p className="text-sm text-[var(--dash-muted)]">Nenhuma conta Meta conectada ainda.</p>
              <a
                href="/api/meta/oauth/start"
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-3 text-sm font-black text-white"
              >
                <Plug size={16} />
                Conectar Meta
              </a>
            </div>
          )}
        </section>

        {/* 3 steps */}
        <section className="mt-8 grid gap-5 xl:grid-cols-3">
          {/* Step 1 — BMs */}
          <div className="rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-6 shadow-[var(--dash-shadow)]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--dash-faint)]">Etapa 1</p>
            <h2 className="mt-2 text-xl font-black">Business Managers</h2>
            <button
              onClick={syncAccounts}
              disabled={!connected || syncing}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 text-sm font-black text-white disabled:opacity-40"
            >
              {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Sincronizar contas
            </button>
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {businesses.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--dash-border)] p-4 text-sm text-[var(--dash-muted)]">
                  {connected ? 'Clique em "Sincronizar contas" para listar os BMs.' : 'Conecte sua conta Meta primeiro.'}
                </p>
              ) : businesses.map(bm => (
                <button
                  key={bm.id}
                  onClick={() => setSelectedBmId(bm.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                    selectedBmId === bm.id
                      ? 'border-cyan-300/40 bg-cyan-300/10'
                      : 'border-[var(--dash-border)] bg-white/5 hover:border-cyan-300/20'
                  }`}
                >
                  <ChevronRight size={14} className={`shrink-0 transition-transform ${selectedBmId === bm.id ? 'rotate-90 text-cyan-300' : 'text-[var(--dash-faint)]'}`} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{bm.name}</p>
                    <p className="text-xs text-[var(--dash-faint)]">{bm.ad_accounts.length} conta(s)</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 — Ad Accounts (multi-select) */}
          <div className="rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-6 shadow-[var(--dash-shadow)]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--dash-faint)]">Etapa 2</p>
            <h2 className="mt-2 text-xl font-black">Contas de anúncio</h2>
            {selectedAccountIds.size > 0 && (
              <p className="mt-1 text-xs text-violet-400">
                {selectedAccountIds.size} conta{selectedAccountIds.size !== 1 ? 's' : ''} selecionada{selectedAccountIds.size !== 1 ? 's' : ''}
              </p>
            )}
            <div className="mt-5 max-h-80 space-y-2 overflow-y-auto pr-1">
              {!selectedBm ? (
                <p className="rounded-2xl border border-dashed border-[var(--dash-border)] p-4 text-sm text-[var(--dash-muted)]">
                  Selecione um Business Manager na Etapa 1.
                </p>
              ) : selectedBm.ad_accounts.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--dash-border)] p-4 text-sm text-[var(--dash-muted)]">
                  Nenhuma conta encontrada neste BM.
                </p>
              ) : selectedBm.ad_accounts.map(acc => {
                const isSelected = selectedAccountIds.has(acc.id)
                const isLinked = projectAccounts.some(pa => pa.account_id === acc.id)
                return (
                  <button
                    key={acc.id}
                    onClick={() => toggleAccount(acc.id)}
                    className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? 'border-violet-400/40 bg-violet-400/10'
                        : 'border-[var(--dash-border)] bg-white/5 hover:border-violet-300/20'
                    }`}
                  >
                    <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
                      isSelected ? 'border-violet-400 bg-violet-400' : 'border-[var(--dash-faint)]'
                    }`}>
                      {isSelected && <Check size={10} className="text-white" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black">{acc.name}</p>
                      <p className="text-xs text-[var(--dash-faint)]">
                        {acc.id} · {acc.currency ?? '—'} · {accountStatusLabel(acc.account_status)}
                        {isLinked && <span className="ml-2 text-emerald-400">● vinculada</span>}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Step 3 — Link to dashboard */}
          <div className="rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-6 shadow-[var(--dash-shadow)]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--dash-faint)]">Etapa 3</p>
            <h2 className="mt-2 text-xl font-black">Vincular ao dashboard</h2>
            <select
              value={selectedDashboardId}
              onChange={e => setSelectedDashboardId(e.target.value)}
              className="mt-5 h-12 w-full rounded-2xl border border-[var(--dash-border)] bg-[#080a12] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300/60"
            >
              {dashboards.map(d => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>

            <div className="mt-4 rounded-2xl border border-[var(--dash-border)] bg-white/5 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-[var(--dash-faint)]">Contas vinculadas a este projeto</p>
              {projectAccounts.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--dash-muted)]">Nenhuma conta vinculada.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {projectAccounts.map(pa => (
                    <div key={pa.account_id} className="flex items-start gap-2">
                      <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-400" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{pa.account_name ?? pa.account_id}</p>
                        {pa.bm_name && (
                          <p className="text-xs text-[var(--dash-faint)]">BM: {pa.bm_name}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={saveLink}
              disabled={!connected || saving}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 text-sm font-black text-white disabled:opacity-40"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Salvar vínculo ({selectedAccountIds.size} conta{selectedAccountIds.size !== 1 ? 's' : ''})
            </button>

            {projectAccounts.length > 0 && (
              <div className="mt-3">
                {!unlinkConfirm ? (
                  <button
                    onClick={() => setUnlinkConfirm(true)}
                    className="w-full text-xs font-semibold text-red-400 transition-colors hover:text-red-300"
                  >
                    Desvincular todas as contas
                  </button>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
                    <p className="min-w-0 flex-1 text-xs text-red-300">Remover todos os vínculos deste projeto?</p>
                    <button
                      onClick={unlinkAllAccounts}
                      disabled={unlinking}
                      className="shrink-0 text-xs font-bold text-red-300 transition-colors hover:text-red-200 disabled:opacity-50"
                    >
                      {unlinking ? <Loader2 size={12} className="animate-spin" /> : 'Confirmar'}
                    </button>
                    <button
                      onClick={() => setUnlinkConfirm(false)}
                      className="shrink-0 text-xs text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text)]"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Features */}
        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-[1.6rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-5 shadow-[var(--dash-shadow)] transition-transform hover:-translate-y-1">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-cyan-300">
                <Icon size={20} />
              </div>
              <h3 className="font-black">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[var(--dash-muted)]">{text}</p>
            </div>
          ))}
        </section>

        {/* CTA */}
        <section className="mt-8 rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-7 shadow-[var(--dash-shadow)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-black">Insights rápidos sem rolar colunas no gerenciador.</h2>
              <p className="mt-2 text-sm text-[var(--dash-muted)]">
                Conecte Meta OAuth, selecione múltiplas contas de anúncio e os widgets Meta exibem dados consolidados automaticamente.
              </p>
            </div>
            <div className="grid min-w-80 grid-cols-3 gap-3">
              {[[Target, 'CPA'], [MousePointerClick, 'CTR'], [TrendingUp, 'ROAS']].map(([Icon, label]) => {
                const MetricIcon = Icon as typeof Target
                return (
                  <div key={String(label)} className="rounded-2xl border border-[var(--dash-border)] bg-white/5 p-4 text-center">
                    <MetricIcon className="mx-auto text-cyan-300" size={20} />
                    <p className="mt-2 text-sm font-black">{String(label)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default function IntegracoesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--dash-bg)]" />}>
      <IntegracoesContent />
    </Suspense>
  )
}
