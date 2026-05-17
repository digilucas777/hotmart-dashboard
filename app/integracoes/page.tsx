'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock3,
  Image,
  Link2,
  Loader2,
  MousePointerClick,
  Plug,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Projeto } from '@/lib/types'

type BusinessManager = {
  id: string
  bm_id: string
  name: string
  verification_status?: string | null
  selected: boolean
}

type AdAccount = {
  id: string
  business_manager_id?: string | null
  account_id: string
  meta_account_id: string
  name: string
  currency?: string | null
  account_status?: number | null
}

const metaMetrics = [
  'Gasto total',
  'Impressões',
  'Alcance',
  'Frequência',
  'Cliques no link',
  'CTR',
  'CPC',
  'CPM',
  'Leads',
  'Custo por lead',
  'Conversões',
  'Custo por compra',
  'ROAS',
  'Receita atribuída',
]

const features = [
  {
    icon: Boxes,
    title: 'Múltiplas contas',
    text: 'Acesse várias contas de anúncios na mesma dashboard e visualize métricas consolidadas como gasto total, leads e receita.',
  },
  {
    icon: BarChart3,
    title: 'Funil Adaptável',
    text: 'Funil dinâmico para e-commerce, mensagens, infoproduto, cadastro e delivery, exibindo custo e taxa de conversão entre cada etapa.',
  },
  {
    icon: Link2,
    title: 'Rastreio de UTMs',
    text: 'Rastreie a origem das conversões e analise campanhas, conjuntos e anúncios que trouxeram mais resultado.',
  },
  {
    icon: Clock3,
    title: 'Atualizada em tempo real',
    text: 'Clientes entram na dashboard e acompanham as métricas sem depender de novos relatórios a cada real investido.',
  },
  {
    icon: Image,
    title: 'Imagem dos criativos',
    text: 'Exiba criativos destaque com CTR, custo por resultado, conversões e outras métricas escolhidas por você.',
  },
]

function IntegracoesContent() {
  const searchParams = useSearchParams()
  const [businesses, setBusinesses] = useState<BusinessManager[]>([])
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<string[]>([])
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([])
  const [selectedAdAccountIds, setSelectedAdAccountIds] = useState<string[]>([])
  const [dashboards, setDashboards] = useState<Projeto[]>([])
  const [selectedDashboardId, setSelectedDashboardId] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [savingLinks, setSavingLinks] = useState(false)

  const metaError = searchParams.get('meta_error')
  const metaConnected = searchParams.get('meta') === 'connected'

  const connected = businesses.length > 0
  const selectedDashboard = dashboards.find(dashboard => dashboard.id === selectedDashboardId)

  const loadMeta = useCallback(async () => {
    const [businessResponse, accountsResponse, dashboardsResponse] = await Promise.all([
      fetch('/api/meta/businesses', { cache: 'no-store' }),
      fetch('/api/meta/ad-accounts', { cache: 'no-store' }),
      supabase.from('projetos').select('*').order('data_criacao', { ascending: false }),
    ])

    if (businessResponse.ok) {
      const data = await businessResponse.json() as { businesses: BusinessManager[] }
      setBusinesses(data.businesses ?? [])
      setSelectedBusinessIds((data.businesses ?? []).filter(item => item.selected).map(item => item.id))
    }

    if (accountsResponse.ok) {
      const data = await accountsResponse.json() as { adAccounts: AdAccount[] }
      setAdAccounts(data.adAccounts ?? [])
    }

    setDashboards((dashboardsResponse.data ?? []) as Projeto[])
    if (!selectedDashboardId && dashboardsResponse.data?.[0]) {
      setSelectedDashboardId((dashboardsResponse.data[0] as Projeto).id)
    }
    setLoading(false)
  }, [selectedDashboardId])

  useEffect(() => {
    queueMicrotask(() => {
      void loadMeta()
    })
  }, [loadMeta])

  useEffect(() => {
    if (!selectedDashboardId) return
    fetch(`/api/meta/dashboard-ad-accounts?dashboardId=${selectedDashboardId}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : { linkedIds: [] })
      .then((data: { linkedIds: string[] }) => setSelectedAdAccountIds(data.linkedIds ?? []))
      .catch(() => setSelectedAdAccountIds([]))
  }, [selectedDashboardId])

  async function syncAdAccounts() {
    setSyncing(true)
    const response = await fetch('/api/meta/ad-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessManagerIds: selectedBusinessIds }),
    })

    if (response.ok) {
      const data = await response.json() as { adAccounts: AdAccount[] }
      setAdAccounts(data.adAccounts ?? [])
    }

    setSyncing(false)
  }

  async function saveDashboardAccounts() {
    if (!selectedDashboardId) return
    setSavingLinks(true)
    await fetch('/api/meta/dashboard-ad-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dashboardId: selectedDashboardId,
        adAccountIds: selectedAdAccountIds,
      }),
    })
    setSavingLinks(false)
  }

  const accountsByBusiness = useMemo(() => {
    return adAccounts.reduce<Record<string, AdAccount[]>>((acc, account) => {
      const key = account.business_manager_id ?? 'sem-bm'
      acc[key] = [...(acc[key] ?? []), account]
      return acc
    }, {})
  }, [adAccounts])

  return (
    <div className="min-h-screen bg-[var(--dash-bg)] text-[var(--dash-text)]">
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
          <Link href="/api/meta/oauth/start" className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-3 text-sm font-black text-white shadow-[0_0_30px_rgba(0,212,255,0.2)] transition-transform hover:-translate-y-0.5">
            <Plug size={16} />
            {connected ? 'Reconectar Meta' : 'Conectar Meta'}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-10">
        {(metaConnected || metaError) && (
          <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-bold ${
            metaConnected
              ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100'
              : 'border-red-400/20 bg-red-500/10 text-red-200'
          }`}>
            {metaConnected ? 'Meta conectado. Selecione os Business Managers e sincronize as contas.' : `Falha na conexão Meta: ${metaError}`}
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-7 shadow-[var(--dash-shadow)]">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-200">
              <ShieldCheck size={14} />
              OAuth Meta real
            </div>
            <h2 className="text-3xl font-black">Conecte Facebook, BMs e contas por dashboard.</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--dash-muted)]">
              Cada dashboard pode ter contas de anúncio próprias. Conecte o Facebook, escolha os Business Managers, sincronize contas e vincule apenas o que pertence a cada cliente.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {['Facebook OAuth', 'Business Managers', 'Contas de anúncios', 'Vínculo por dashboard', 'Métricas Meta Ads', 'Criativos destaque'].map((item, index) => (
                <div key={item} className="flex items-center gap-2 rounded-2xl border border-[var(--dash-border)] bg-white/5 px-4 py-3 text-sm font-bold">
                  <CheckCircle2 size={15} className={index < 4 ? 'text-cyan-300' : 'text-violet-300'} />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-7 shadow-[var(--dash-shadow)]">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm font-black text-cyan-200">
                <TrendingUp size={18} />
                Principais métricas Meta Ads
              </div>
              {loading && <Loader2 size={18} className="animate-spin text-cyan-200" />}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
              {metaMetrics.map(metric => (
                <div key={metric} className="rounded-2xl border border-[var(--dash-border)] bg-white/5 px-4 py-3 text-sm font-semibold text-[var(--dash-text)]">
                  {metric}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-5 xl:grid-cols-3">
          <div className="rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-6 shadow-[var(--dash-shadow)]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--dash-faint)]">Etapa 1</p>
            <h2 className="mt-2 text-xl font-black">Business Managers</h2>
            <div className="mt-5 max-h-72 space-y-2 overflow-y-auto pr-1">
              {businesses.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--dash-border)] p-4 text-sm text-[var(--dash-muted)]">
                  Conecte sua conta Meta para listar os BMs disponíveis.
                </p>
              ) : businesses.map(business => (
                <label key={business.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[var(--dash-border)] bg-white/5 px-4 py-3 transition-colors hover:border-cyan-300/30">
                  <input
                    type="checkbox"
                    checked={selectedBusinessIds.includes(business.id)}
                    onChange={event => setSelectedBusinessIds(prev =>
                      event.target.checked ? [...prev, business.id] : prev.filter(id => id !== business.id),
                    )}
                    className="h-4 w-4 accent-cyan-400"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{business.name}</p>
                    <p className="text-xs text-[var(--dash-faint)]">{business.verification_status ?? business.bm_id}</p>
                  </div>
                </label>
              ))}
            </div>
            <button
              onClick={syncAdAccounts}
              disabled={selectedBusinessIds.length === 0 || syncing}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 text-sm font-black text-white disabled:opacity-50"
            >
              {syncing && <Loader2 size={16} className="animate-spin" />}
              Sincronizar contas
            </button>
          </div>

          <div className="rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-6 shadow-[var(--dash-shadow)]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--dash-faint)]">Etapa 2</p>
            <h2 className="mt-2 text-xl font-black">Contas de anúncios</h2>
            <div className="mt-5 max-h-80 space-y-3 overflow-y-auto pr-1">
              {adAccounts.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--dash-border)] p-4 text-sm text-[var(--dash-muted)]">
                  Escolha os BMs e sincronize para carregar as contas.
                </p>
              ) : adAccounts.map(account => (
                <label key={account.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--dash-border)] bg-white/5 px-4 py-3 transition-colors hover:border-cyan-300/30">
                  <input
                    type="checkbox"
                    checked={selectedAdAccountIds.includes(account.id)}
                    onChange={event => setSelectedAdAccountIds(prev =>
                      event.target.checked ? [...prev, account.id] : prev.filter(id => id !== account.id),
                    )}
                    className="mt-1 h-4 w-4 accent-violet-400"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{account.name}</p>
                    <p className="text-xs text-[var(--dash-faint)]">act_{account.account_id} · {account.currency ?? 'Moeda não informada'}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-6 shadow-[var(--dash-shadow)]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--dash-faint)]">Etapa 3</p>
            <h2 className="mt-2 text-xl font-black">Vincular ao dashboard</h2>
            <select
              value={selectedDashboardId}
              onChange={event => setSelectedDashboardId(event.target.value)}
              className="mt-5 h-12 w-full rounded-2xl border border-[var(--dash-border)] bg-[#080a12] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300/60"
            >
              {dashboards.map(dashboard => (
                <option key={dashboard.id} value={dashboard.id}>{dashboard.nome}</option>
              ))}
            </select>
            <div className="mt-5 rounded-2xl border border-[var(--dash-border)] bg-white/5 p-4">
              <p className="text-sm font-black">{selectedDashboard?.nome ?? 'Nenhum dashboard selecionado'}</p>
              <p className="mt-1 text-xs text-[var(--dash-muted)]">
                {selectedAdAccountIds.length} conta(s) selecionada(s) para este dashboard.
              </p>
            </div>
            <button
              onClick={saveDashboardAccounts}
              disabled={!selectedDashboardId || savingLinks}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 text-sm font-black text-white disabled:opacity-50"
            >
              {savingLinks && <Loader2 size={16} className="animate-spin" />}
              Salvar vínculo
            </button>
            <div className="mt-5 space-y-2">
              {selectedBusinessIds.map(id => (
                <p key={id} className="text-xs text-[var(--dash-faint)]">
                  {(accountsByBusiness[id] ?? []).length} conta(s) carregada(s) deste BM.
                </p>
              ))}
            </div>
          </div>
        </section>

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

        <section className="mt-8 rounded-[2rem] border border-[var(--dash-border)] bg-[var(--dash-panel)] p-7 shadow-[var(--dash-shadow)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-black">Insights rápidos sem rolar colunas no gerenciador.</h2>
              <p className="mt-2 text-sm text-[var(--dash-muted)]">
                A base agora conecta Meta OAuth, BMs, contas e vínculo por dashboard. Os próximos widgets Meta podem consumir as contas salvas em cada projeto.
              </p>
            </div>
            <div className="grid min-w-80 grid-cols-3 gap-3">
              {[
                [Target, 'CPA'],
                [MousePointerClick, 'CTR'],
                [TrendingUp, 'ROAS'],
              ].map(([Icon, label]) => {
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
