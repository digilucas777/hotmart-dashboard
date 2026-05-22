'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  Bell,
  Clock3,
  Copy,
  CreditCard,
  Edit3,
  ExternalLink,
  ImageIcon,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Projeto } from '@/lib/types'
import { DashSpeedLogo } from './DashSpeedLogo'

const navItems = [
  { label: 'Meus Dashboards', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Integrações', icon: BarChart3, href: '/integracoes' },
  { label: 'Billing', icon: CreditCard, href: '/pricing' },
  { label: 'Configurações', icon: Settings, href: '/configuracoes' },
]

const FOUNDER_EMAILS = ['gestor.digitalcomlucas@gmail.com']

const META_TRAFFIC_TEMPLATE = [
  // Row 1-8: 4 metric cards
  { type: 'metric',       data_source: 'total_converted',        title: 'Total Convertido BRL',        width: '1/4', height: 'medium', col_start: 1,  row_start: 1,  col_span: 3, row_span: 8 },
  { type: 'meta-metric',  data_source: 'meta_spend',             title: 'Gasto Total',                 width: '1/4', height: 'medium', col_start: 4,  row_start: 1,  col_span: 3, row_span: 8 },
  { type: 'meta-metric',  data_source: 'meta_roas_geral',        title: 'ROAS (Geral)',                width: '1/4', height: 'medium', col_start: 7,  row_start: 1,  col_span: 3, row_span: 8 },
  { type: 'metric',       data_source: 'lucro',                  title: 'Lucro',                       width: '1/4', height: 'medium', col_start: 10, row_start: 1,  col_span: 3, row_span: 8 },
  // Row 9-16: 4 metric cards
  { type: 'metric',       data_source: 'total_usd',              title: 'Faturamento USD',             width: '1/4', height: 'medium', col_start: 1,  row_start: 9,  col_span: 3, row_span: 8 },
  { type: 'metric',       data_source: 'sales_count',            title: 'Vendas Aprovadas',            width: '1/4', height: 'medium', col_start: 4,  row_start: 9,  col_span: 3, row_span: 8 },
  { type: 'metric',       data_source: 'pending_count',          title: 'Pendentes',                   width: '1/4', height: 'medium', col_start: 7,  row_start: 9,  col_span: 3, row_span: 8 },
  { type: 'meta-metric',  data_source: 'meta_page_views',        title: 'Visualizações de Página',     width: '1/4', height: 'medium', col_start: 10, row_start: 9,  col_span: 3, row_span: 8 },
  // Row 17-24: 4 metric cards
  { type: 'meta-metric',  data_source: 'meta_checkout_initiated',title: 'Checkouts Iniciados',         width: '1/4', height: 'medium', col_start: 1,  row_start: 17, col_span: 3, row_span: 8 },
  { type: 'meta-metric',  data_source: 'meta_cpm',               title: 'CPM',                         width: '1/4', height: 'medium', col_start: 4,  row_start: 17, col_span: 3, row_span: 8 },
  { type: 'meta-metric',  data_source: 'meta_ctr',               title: 'CTR',                         width: '1/4', height: 'medium', col_start: 7,  row_start: 17, col_span: 3, row_span: 8 },
  { type: 'meta-metric',  data_source: 'meta_link_clicks',       title: 'Cliques no Link',             width: '1/4', height: 'medium', col_start: 10, row_start: 17, col_span: 3, row_span: 8 },
  // Row 25-32: 3 metric cards
  { type: 'meta-metric',  data_source: 'meta_frequency',         title: 'Frequência',                  width: '1/4', height: 'medium', col_start: 1,  row_start: 25, col_span: 3, row_span: 8 },
  { type: 'meta-metric',  data_source: 'meta_hook_rate',         title: 'Hook Rate',                   width: '1/4', height: 'medium', col_start: 4,  row_start: 25, col_span: 3, row_span: 8 },
  { type: 'meta-metric',  data_source: 'meta_connect_rate',      title: 'Connect Rate',                width: '1/4', height: 'medium', col_start: 7,  row_start: 25, col_span: 3, row_span: 8 },
  // Row 33-50: full-width ranking table
  { type: 'meta-creative',data_source: 'meta_creatives_ctr',     title: 'Ranking de Criativos',        width: 'full', height: 'large', col_start: 1,  row_start: 33, col_span: 12, row_span: 18 },
  // Row 51-70: full-width campaigns table
  { type: 'meta-campaign', data_source: 'meta_campaigns',        title: 'Performance de Campanhas',    width: 'full', height: 'large', col_start: 1,  row_start: 51, col_span: 12, row_span: 20 },
  // Row 71-88: pie + line
  { type: 'pie',           data_source: 'by_country',            title: 'Por País',                    width: '1/3', height: 'large', col_start: 1,  row_start: 71, col_span: 4,  row_span: 18 },
  { type: 'line',          data_source: 'revenue_by_day',        title: 'Faturamento por Dia',         width: '2/3', height: 'large', col_start: 5,  row_start: 71, col_span: 8,  row_span: 18 },
] as const

export function UserAppShell() {
  const router = useRouter()
  const [name, setName] = useState('Usuário')
  const [email, setEmail] = useState('')
  const [dashboards, setDashboards] = useState<Projeto[]>([])
  const [widgetsCount, setWidgetsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Projeto | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Projeto | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [savingDashboard, setSavingDashboard] = useState(false)
  const [dashboardName, setDashboardName] = useState('')
  const [dashboardDescription, setDashboardDescription] = useState('')
  const [dashboardCover, setDashboardCover] = useState('')
  const [dashboardColor, setDashboardColor] = useState('#00d4ff')
  const [dashboardCategory, setDashboardCategory] = useState('')
  const [dashboardImage, setDashboardImage] = useState('')
  const [dashboardStatus, setDashboardStatus] = useState('active')
  const [dashboardTemplate, setDashboardTemplate] = useState<'blank' | 'meta-traffic'>('blank')
  const [error, setError] = useState('')

  async function loadDashboards() {
    const { data, error: projectsError } = await supabase
      .from('projetos')
      .select('*')
      .order('data_criacao', { ascending: false })

    if (projectsError) {
      setError('Não foi possível carregar seus dashboards.')
      return
    }

    const projects = (data ?? []) as Projeto[]
    setDashboards(projects)

    if (projects.length === 0) {
      setWidgetsCount(0)
      return
    }

    const { count } = await supabase
      .from('dashboard_widgets')
      .select('id', { count: 'exact', head: true })
      .in('projeto_id', projects.map(project => project.id))

    setWidgetsCount(count ?? 0)
  }

  useEffect(() => {
    let active = true

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active) return
      setName(user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário')
      setEmail(user?.email ?? '')
    })

    Promise.resolve().then(loadDashboards).finally(() => {
      if (active) setLoading(false)
    })

    return () => {
      active = false
    }
  }, [])

  async function createDashboard(e: React.FormEvent) {
    e.preventDefault()
    if (!dashboardName.trim()) return

    setCreating(true)
    setError('')

    const { data, error: createError } = await supabase
      .from('projetos')
      .insert({
        nome: dashboardName.trim(),
        descricao: dashboardDescription.trim() || null,
      })
      .select()
      .single()

    if (createError || !data) {
      setCreating(false)
      setError('Não foi possível criar o dashboard agora.')
      return
    }

    const newProject = data as Projeto

    if (dashboardTemplate === 'meta-traffic') {
      const rows = META_TRAFFIC_TEMPLATE.map((w, i) => ({ ...w, projeto_id: newProject.id, position: i }))
      const { error: tplErr } = await supabase.from('dashboard_widgets').insert(rows)
      if (tplErr) {
        const fallback = META_TRAFFIC_TEMPLATE.map((w, i) => ({
          type: w.type,
          data_source: w.data_source,
          title: w.title,
          width: w.width,
          height: w.height,
          projeto_id: newProject.id,
          position: i,
        }))
        await supabase.from('dashboard_widgets').insert(fallback)
      }
    }

    setCreating(false)
    setShowCreate(false)
    setDashboardName('')
    setDashboardDescription('')
    setDashboardTemplate('blank')
    setDashboards(prev => [newProject, ...prev])
    router.push(`/dashboard/${newProject.id}`)
  }

  function openEditDashboard(dashboard: Projeto) {
    setEditTarget(dashboard)
    setDashboardName(dashboard.nome)
    setDashboardDescription(dashboard.descricao ?? '')
    setDashboardCover(dashboard.capa_url ?? '')
    setDashboardColor(dashboard.cor ?? '#00d4ff')
    setDashboardCategory(dashboard.categoria ?? '')
    setDashboardImage(dashboard.imagem_url ?? '')
    setDashboardStatus(dashboard.status ?? 'active')
  }

  function resetDashboardForm() {
    setEditTarget(null)
    setDashboardName('')
    setDashboardDescription('')
    setDashboardCover('')
    setDashboardColor('#00d4ff')
    setDashboardCategory('')
    setDashboardImage('')
    setDashboardStatus('active')
  }

  async function saveDashboardDetails(e: React.FormEvent) {
    e.preventDefault()
    if (!editTarget || !dashboardName.trim()) return

    setSavingDashboard(true)
    setError('')

    const fullPayload = {
      nome: dashboardName.trim(),
      descricao: dashboardDescription.trim() || null,
      capa_url: dashboardCover.trim() || null,
      cor: dashboardColor,
      categoria: dashboardCategory.trim() || null,
      imagem_url: dashboardImage.trim() || null,
      status: dashboardStatus,
    }

    let { data, error: updateError } = await supabase
      .from('projetos')
      .update(fullPayload)
      .eq('id', editTarget.id)
      .select()
      .single()

    if (updateError && (updateError.message.includes('schema cache') || updateError.message.includes('capa_url'))) {
      const retry = await supabase
        .from('projetos')
        .update({ nome: fullPayload.nome, descricao: fullPayload.descricao })
        .eq('id', editTarget.id)
        .select()
        .single()
      data = retry.data
      updateError = retry.error
    }

    setSavingDashboard(false)

    if (updateError || !data) {
      setError('Não foi possível salvar os detalhes do dashboard.')
      return
    }

    setDashboards(prev => prev.map(dashboard => dashboard.id === editTarget.id ? data as Projeto : dashboard))
    resetDashboardForm()
  }

  async function duplicateDashboard(dashboard: Projeto) {
    setDuplicatingId(dashboard.id)
    setError('')

    const payload = {
      nome: `Cópia de ${dashboard.nome}`,
      descricao: dashboard.descricao ?? null,
      capa_url: dashboard.capa_url ?? null,
      cor: dashboard.cor ?? null,
      categoria: dashboard.categoria ?? null,
      imagem_url: dashboard.imagem_url ?? null,
      status: dashboard.status ?? 'active',
    }

    let { data: duplicated, error: duplicateError } = await supabase
      .from('projetos')
      .insert(payload)
      .select()
      .single()

    if (duplicateError && (duplicateError.message.includes('schema cache') || duplicateError.message.includes('capa_url'))) {
      const retry = await supabase
        .from('projetos')
        .insert({ nome: payload.nome, descricao: payload.descricao })
        .select()
        .single()
      duplicated = retry.data
      duplicateError = retry.error
    }

    if (duplicateError || !duplicated) {
      setDuplicatingId(null)
      setError('Não foi possível duplicar este dashboard.')
      return
    }

    const newProject = duplicated as Projeto
    const [{ data: widgets }, { data: products }, { data: adAccounts }] = await Promise.all([
      supabase
        .from('dashboard_widgets')
        .select('type,data_source,title,width,position,height,col_start,row_start,col_span,row_span')
        .eq('projeto_id', dashboard.id)
        .order('position'),
      supabase.from('projeto_produtos').select('produto_id').eq('projeto_id', dashboard.id),
      supabase.from('dashboard_ad_accounts').select('ad_account_id').eq('dashboard_id', dashboard.id),
    ])

    if (widgets?.length) {
      await supabase.from('dashboard_widgets').insert(widgets.map(widget => ({
        ...widget,
        projeto_id: newProject.id,
      })))
    }

    if (products?.length) {
      await supabase.from('projeto_produtos').insert(products.map(({ produto_id }) => ({
        projeto_id: newProject.id,
        produto_id,
      })))
    }

    if (adAccounts?.length) {
      await supabase.from('dashboard_ad_accounts').insert(adAccounts.map(({ ad_account_id }) => ({
        dashboard_id: newProject.id,
        ad_account_id,
      })))
    }

    setDuplicatingId(null)
    await loadDashboards()
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function deleteDashboard() {
    if (!deleteTarget) return

    setDeleting(true)
    setError('')

    await supabase.from('projeto_produtos').delete().eq('projeto_id', deleteTarget.id)
    await supabase.from('dashboard_widgets').delete().eq('projeto_id', deleteTarget.id)
    const { error: deleteError } = await supabase.from('projetos').delete().eq('id', deleteTarget.id)

    setDeleting(false)

    if (deleteError) {
      setError('Não foi possível excluir este dashboard agora.')
      return
    }

    setDashboards(prev => prev.filter(dashboard => dashboard.id !== deleteTarget.id))
    setDeleteTarget(null)
    await loadDashboards()
  }

  const stats = useMemo(
    () => [
      ['Dashboards ativos', String(dashboards.length), dashboards.length === 1 ? '1 dashboard criado na sua conta' : 'Dashboards criados na sua conta'],
      ['Widgets salvos', String(widgetsCount), 'Widgets configurados nos seus dashboards'],
      ['Integrações', 'Em breve', 'Meta Ads, Google Ads, Hotmart, Kiwify e Shopify'],
    ],
    [dashboards.length, widgetsCount],
  )

  const isFounder = FOUNDER_EMAILS.includes(email.toLowerCase()) || email.toLowerCase().startsWith('gestor.digitalcomlucas@')
  const dashboardsLimit = isFounder ? Infinity : 3
  const dashboardsAvailable = isFounder ? 'Ilimitados' : String(Math.max(0, dashboardsLimit - dashboards.length))
  const planProgress = isFounder ? 100 : Math.min(100, (dashboards.length / dashboardsLimit) * 100)
  const recentDashboards = dashboards.slice(0, 3)
  const lastEdited = dashboards[0]

  return (
    <div className="min-h-screen bg-[#07080d] text-white">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-white/10 bg-[#0b0d14]/90 p-5 backdrop-blur-2xl lg:block">
        <DashSpeedLogo />
        <nav className="mt-10 space-y-2">
          {navItems.map(({ label, icon: Icon, href }, index) => (
            <Link
              key={label}
              href={href}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors ${
                index === 0 ? 'bg-cyan-400/10 text-cyan-100' : 'text-slate-500 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="absolute inset-x-5 bottom-5 overflow-hidden rounded-3xl border border-cyan-300/15 bg-[linear-gradient(135deg,rgba(0,212,255,0.08),rgba(139,92,246,0.1))] p-4 shadow-[0_0_34px_rgba(0,212,255,0.08)]">
          <p className="text-xs text-slate-500">Plano atual</p>
          <p className="mt-1 font-black">{isFounder ? 'Founder ilimitado' : 'Pro'}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-2xl bg-black/20 p-2">
              <p className="text-slate-500">Usados</p>
              <p className="font-black text-white">{dashboards.length}</p>
            </div>
            <div className="rounded-2xl bg-black/20 p-2">
              <p className="text-slate-500">Disponíveis</p>
              <p className="font-black text-white">{dashboardsAvailable}</p>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400" style={{ width: `${planProgress}%` }} />
          </div>
          <Link href="/pricing" className="mt-3 inline-flex text-sm font-bold text-cyan-200 hover:text-white">
            Gerenciar assinatura
          </Link>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07080d]/80 px-4 py-4 backdrop-blur-2xl sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Área do usuário</p>
              <h1 className="mt-1 text-xl font-black sm:text-2xl">Meus Dashboards</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/projects" title="Projetos clássicos" className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-slate-300 transition-colors hover:text-white sm:flex">
                <Bell size={17} />
              </Link>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500">
                  <UserRound size={17} />
                </div>
                <div className="hidden text-left sm:block">
                  <p className="text-sm font-bold">{name}</p>
                  <p className="max-w-40 truncate text-xs text-slate-500">{email}</p>
                </div>
              </div>
              <button onClick={logout} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-slate-400 transition-colors hover:text-red-300">
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </header>

        <main className="px-4 py-8 sm:px-6">
          <section className="grid gap-4 lg:grid-cols-3">
            {stats.map(([label, value, description]) => (
              <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-black">{loading && label !== 'Integrações' ? <Loader2 className="animate-spin" size={28} /> : value}</p>
                <p className="mt-2 text-sm text-slate-400">{description}</p>
              </div>
            ))}
          </section>

          {error && (
            <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black">Meus Dashboards</h2>
                <p className="mt-1 text-sm text-slate-400">Crie, abra e edite os dashboards que já usam a estrutura atual.</p>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-3 text-sm font-black text-white shadow-[0_0_30px_rgba(0,212,255,0.2)] transition-transform hover:-translate-y-0.5"
              >
                <Plus size={16} />
                Novo dashboard
              </button>
            </div>

            {loading ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map(item => (
                  <div key={item} className="h-64 animate-pulse rounded-3xl border border-white/10 bg-white/[0.035]" />
                ))}
              </div>
            ) : dashboards.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-dashed border-white/15 bg-[#0b0d14] p-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                  <LayoutDashboard size={24} />
                </div>
                <h3 className="mt-5 text-xl font-black">Nenhum dashboard criado ainda</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                  Crie seu primeiro dashboard para começar a configurar produtos, widgets e relatórios.
                </p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-3 text-sm font-black text-white"
                >
                  <Plus size={16} />
                  Criar primeiro dashboard
                </button>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {dashboards.map((dashboard, index) => (
                  <div key={dashboard.id} className="rounded-3xl border border-white/10 bg-[#0b0d14] p-5 transition-all hover:-translate-y-1 hover:border-cyan-300/30 hover:shadow-[0_22px_60px_rgba(0,212,255,0.12)]">
                    <div className="mb-6 h-28 rounded-2xl bg-[linear-gradient(135deg,rgba(0,212,255,0.2),rgba(167,139,250,0.14))] p-4">
                      <div className="flex h-full items-end justify-between">
                        <div className="h-10 w-20 rounded-xl bg-white/10" />
                        <div className="flex gap-1">
                          <div className="h-16 w-3 rounded-full bg-cyan-300/70" />
                          <div className="h-10 w-3 rounded-full bg-violet-300/70" />
                          <div className="h-20 w-3 rounded-full bg-cyan-100/80" />
                        </div>
                      </div>
                    </div>
                    <p className="font-black">{dashboard.nome}</p>
                    <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">
                      {dashboard.descricao || (index === 0 ? 'Dashboard principal da operação' : 'Dashboard pronto para configurar')}
                    </p>
                    <div className="mt-5 grid gap-2 sm:grid-cols-2">
                      <Link href={`/dashboard/${dashboard.id}`} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3 text-sm font-black text-white shadow-[0_0_28px_rgba(0,212,255,0.22)] transition-transform hover:-translate-y-0.5">
                        Abrir dashboard
                        <ExternalLink size={14} />
                      </Link>
                      <button onClick={() => openEditDashboard(dashboard)} className="inline-flex items-center justify-center rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-300 transition-colors hover:border-cyan-300/40 hover:text-white">
                        <Edit3 size={14} />
                        <span className="ml-2">Editar dashboard</span>
                      </button>
                      <button
                        onClick={() => duplicateDashboard(dashboard)}
                        disabled={duplicatingId === dashboard.id}
                        className="inline-flex items-center justify-center rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-300 transition-colors hover:border-violet-300/40 hover:text-white disabled:opacity-60"
                      >
                        {duplicatingId === dashboard.id ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                        <span className="ml-2">Duplicar dashboard</span>
                      </button>
                      <button
                        onClick={() => setDeleteTarget(dashboard)}
                        className="inline-flex items-center justify-center rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-400 transition-colors hover:border-red-300/35 hover:bg-red-500/10 hover:text-red-200"
                      >
                        <Trash2 size={14} />
                        <span className="ml-2">Excluir dashboard</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mt-8 grid gap-4 xl:grid-cols-3">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
                  <Clock3 size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black">Atividade recente</h2>
                  <p className="text-sm text-slate-500">Resumo rápido da conta</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {(recentDashboards.length ? recentDashboards : [{ id: 'empty', nome: 'Nenhuma atividade ainda', descricao: 'Crie ou abra um dashboard para começar.' } as Projeto]).map((dashboard, index) => (
                  <div key={dashboard.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{dashboard.nome}</p>
                      <p className="text-xs text-slate-500">{index === 0 && lastEdited ? 'Último dashboard editado' : 'Dashboard recente'}</p>
                    </div>
                    <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200">
                      {index === 0 ? 'Novo' : 'Ativo'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-400/10 text-violet-200">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black">Dashboards em foco</h2>
                  <p className="text-sm text-slate-500">Mais acessados e recentes</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {recentDashboards.length ? recentDashboards.map((dashboard, index) => (
                  <Link key={dashboard.id} href={`/dashboard/${dashboard.id}`} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 transition-colors hover:border-cyan-300/35">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/30 to-violet-500/30 text-sm font-black">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{dashboard.nome}</p>
                      <p className="text-xs text-slate-500">{dashboard.descricao || 'Pronto para abrir'}</p>
                    </div>
                  </Link>
                )) : (
                  <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-500">Os dashboards mais acessados aparecem aqui.</p>
                )}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-200">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black">Status integrações</h2>
                  <p className="text-sm text-slate-500">Meta Ads em preparação</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                {['Meta Ads', 'Business Manager', 'Contas de anúncios'].map((item, index) => (
                  <Link key={item} href="/integracoes" className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 transition-colors hover:border-cyan-300/35">
                    <span className="text-sm font-bold">{item}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${index === 0 ? 'bg-cyan-400/10 text-cyan-200' : 'bg-white/5 text-slate-400'}`}>
                      {index === 0 ? 'Pronto' : 'Em breve'}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-4 lg:grid-cols-2">
            <Link href="/integracoes" className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 transition-colors hover:border-cyan-300/30">
              <h2 className="text-lg font-black">Conectar integrações</h2>
              <p className="mt-2 text-sm text-slate-400">Abra a área de integrações para conectar WhatsApp e preparar as próximas fontes de dados.</p>
            </Link>
            <Link href="/pricing" className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 transition-colors hover:border-cyan-300/30">
              <h2 className="text-lg font-black">Billing preparado</h2>
              <p className="mt-2 text-sm text-slate-400">Veja planos e estrutura futura para assinatura mensal, upgrade e downgrade.</p>
            </Link>
          </section>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-[#0b0d14]/95 p-2 backdrop-blur-2xl lg:hidden">
        {navItems.map(({ label, icon: Icon, href }, index) => (
          <Link key={label} href={href} className={`flex flex-1 flex-col items-center justify-center rounded-2xl px-2 py-2 text-[10px] font-bold ${index === 0 ? 'bg-cyan-400/10 text-cyan-100' : 'text-slate-500'}`}>
            <Icon size={17} />
            <span className="mt-1">{label.split(' ')[0]}</span>
          </Link>
        ))}
      </nav>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <form onSubmit={createDashboard} className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#0b0d14] p-6 shadow-2xl shadow-black/50">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Novo dashboard</p>
                <h2 className="mt-1 text-xl font-black">Criar dashboard</h2>
              </div>
              <button type="button" onClick={() => setShowCreate(false)} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-slate-400 hover:text-white">
                <X size={17} />
              </button>
            </div>

            <div className="mb-4">
              <span className="mb-1.5 block text-xs font-semibold text-slate-500">Template</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDashboardTemplate('blank')}
                  className={`rounded-2xl border px-3 py-2.5 text-left text-sm font-semibold transition-all ${
                    dashboardTemplate === 'blank'
                      ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200'
                      : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
                  }`}
                >
                  <p>Em branco</p>
                  <p className="mt-0.5 text-[11px] font-normal opacity-60">Dashboard vazio</p>
                </button>
                <button
                  type="button"
                  onClick={() => setDashboardTemplate('meta-traffic')}
                  className={`rounded-2xl border px-3 py-2.5 text-left text-sm font-semibold transition-all ${
                    dashboardTemplate === 'meta-traffic'
                      ? 'border-violet-400/60 bg-violet-400/10 text-violet-200'
                      : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
                  }`}
                >
                  <p>Tráfego Meta Ads</p>
                  <p className="mt-0.5 text-[11px] font-normal opacity-60">19 widgets pré-configurados</p>
                </button>
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-500">Nome do dashboard</span>
              <input
                autoFocus
                value={dashboardName}
                onChange={event => setDashboardName(event.target.value)}
                placeholder="Ex: Cliente Principal"
                className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-300/60"
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-500">Descrição</span>
              <textarea
                value={dashboardDescription}
                onChange={event => setDashboardDescription(event.target.value)}
                placeholder="Opcional"
                rows={3}
                className="w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-300/60"
              />
            </label>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => setShowCreate(false)} className="h-12 flex-1 rounded-2xl border border-white/10 text-sm font-black text-slate-300 transition-colors hover:text-white">
                Cancelar
              </button>
              <button disabled={!dashboardName.trim() || creating} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 text-sm font-black text-white disabled:opacity-50">
                {creating && <Loader2 size={16} className="animate-spin" />}
                Criar e abrir
              </button>
            </div>
          </form>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm">
          <form onSubmit={saveDashboardDetails} className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-[#0b0d14] p-6 shadow-2xl shadow-black/60">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-cyan-200">
                  <ImageIcon size={19} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Editar dashboard</p>
                  <h2 className="mt-1 text-xl font-black">Identidade e configurações</h2>
                </div>
              </div>
              <button type="button" onClick={resetDashboardForm} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-slate-400 hover:text-white">
                <X size={17} />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-500">Nome</span>
                <input
                  value={dashboardName}
                  onChange={event => setDashboardName(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-300/60"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-500">Categoria</span>
                <input
                  value={dashboardCategory}
                  onChange={event => setDashboardCategory(event.target.value)}
                  placeholder="Ex: Tráfego pago"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-300/60"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-slate-500">Descrição</span>
                <textarea
                  value={dashboardDescription}
                  onChange={event => setDashboardDescription(event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-300/60"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-500">Capa</span>
                <input
                  value={dashboardCover}
                  onChange={event => setDashboardCover(event.target.value)}
                  placeholder="URL da capa"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-300/60"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-500">Imagem</span>
                <input
                  value={dashboardImage}
                  onChange={event => setDashboardImage(event.target.value)}
                  placeholder="URL da imagem"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-300/60"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-500">Cor</span>
                <div className="flex h-12 items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-3">
                  <input
                    type="color"
                    value={dashboardColor}
                    onChange={event => setDashboardColor(event.target.value)}
                    className="h-8 w-10 rounded-lg border-0 bg-transparent"
                  />
                  <span className="text-sm font-bold text-slate-300">{dashboardColor}</span>
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-500">Status</span>
                <select
                  value={dashboardStatus}
                  onChange={event => setDashboardStatus(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-white/10 bg-[#080a12] px-4 text-sm text-white outline-none transition-colors focus:border-cyan-300/60"
                >
                  <option value="active">Ativo</option>
                  <option value="draft">Rascunho</option>
                  <option value="archived">Arquivado</option>
                </select>
              </label>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={resetDashboardForm} className="h-12 flex-1 rounded-2xl border border-white/10 text-sm font-black text-slate-300 transition-colors hover:text-white">
                Cancelar
              </button>
              <button disabled={!dashboardName.trim() || savingDashboard} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 text-sm font-black text-white disabled:opacity-50">
                {savingDashboard && <Loader2 size={16} className="animate-spin" />}
                Salvar dashboard
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md animate-in rounded-[2rem] border border-white/10 bg-[#0b0d14] p-6 shadow-2xl shadow-black/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-200">
              <Trash2 size={21} />
            </div>
            <h2 className="mt-5 text-xl font-black">Deseja realmente excluir este dashboard?</h2>
            <p className="mt-2 text-sm text-slate-500">
              {deleteTarget.nome} será removido da sua área de dashboards.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="h-12 flex-1 rounded-2xl border border-white/10 text-sm font-black text-slate-300 transition-colors hover:text-white disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={deleteDashboard}
                disabled={deleting}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 text-sm font-black text-white shadow-[0_0_28px_rgba(239,68,68,0.25)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {deleting && <Loader2 size={16} className="animate-spin" />}
                Excluir dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
