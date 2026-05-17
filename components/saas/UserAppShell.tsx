'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  Bell,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  Settings,
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

export function UserAppShell() {
  const router = useRouter()
  const [name, setName] = useState('Usuário')
  const [email, setEmail] = useState('')
  const [dashboards, setDashboards] = useState<Projeto[]>([])
  const [widgetsCount, setWidgetsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [dashboardName, setDashboardName] = useState('')
  const [dashboardDescription, setDashboardDescription] = useState('')
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

    setCreating(false)

    if (createError || !data) {
      setError('Não foi possível criar o dashboard agora.')
      return
    }

    setShowCreate(false)
    setDashboardName('')
    setDashboardDescription('')
    setDashboards(prev => [data as Projeto, ...prev])
    router.push(`/dashboard/${(data as Projeto).id}`)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const stats = useMemo(
    () => [
      ['Dashboards ativos', String(dashboards.length), dashboards.length === 1 ? '1 dashboard criado na sua conta' : 'Dashboards criados na sua conta'],
      ['Widgets salvos', String(widgetsCount), 'Widgets configurados nos seus dashboards'],
      ['Integrações', 'Em breve', 'Meta Ads, Google Ads, Hotmart, Kiwify e Shopify'],
    ],
    [dashboards.length, widgetsCount],
  )

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
        <div className="absolute inset-x-5 bottom-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs text-slate-500">Plano atual</p>
          <p className="mt-1 font-black">Pro placeholder</p>
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
                  <div key={dashboard.id} className="rounded-3xl border border-white/10 bg-[#0b0d14] p-5 transition-colors hover:border-cyan-300/30">
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
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link href={`/dashboard/${dashboard.id}`} className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-cyan-300/40 hover:text-white">
                        Abrir dashboard
                        <ExternalLink size={12} />
                      </Link>
                      <Link href={`/dashboard/${dashboard.id}`} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-cyan-300/40 hover:text-white">
                        Editar layout
                      </Link>
                      <Link href={`/dashboard/${dashboard.id}`} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-cyan-300/40 hover:text-white">
                        Widgets
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
    </div>
  )
}
