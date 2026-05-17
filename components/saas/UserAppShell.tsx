'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, Bell, CreditCard, LayoutDashboard, LogOut, Plus, Settings, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DashSpeedLogo } from './DashSpeedLogo'

const navItems = [
  { label: 'Meus Dashboards', icon: LayoutDashboard },
  { label: 'Integrações', icon: BarChart3 },
  { label: 'Billing', icon: CreditCard },
  { label: 'Configurações', icon: Settings },
]

export function UserAppShell() {
  const router = useRouter()
  const [name, setName] = useState('Usuário')
  const [email, setEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setName(user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário')
      setEmail(user?.email ?? '')
    })
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#07080d] text-white">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-white/10 bg-[#0b0d14]/90 p-5 backdrop-blur-2xl lg:block">
        <DashSpeedLogo />
        <nav className="mt-10 space-y-2">
          {navItems.map(({ label, icon: Icon }, index) => (
            <button
              key={label}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors ${
                index === 0 ? 'bg-cyan-400/10 text-cyan-100' : 'text-slate-500 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              <Icon size={18} />
              {label}
            </button>
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
              <button className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-slate-300 sm:flex">
                <Bell size={17} />
              </button>
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
            {[
              ['Dashboards ativos', '0', 'Estrutura preparada para múltiplos dashboards'],
              ['Widgets salvos', '0', 'Layouts por usuário com isolamento multi-tenant'],
              ['Integrações', 'Em breve', 'Meta Ads, Google Ads, Hotmart, Kiwify e Shopify'],
            ].map(([label, value, description]) => (
              <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-black">{value}</p>
                <p className="mt-2 text-sm text-slate-400">{description}</p>
              </div>
            ))}
          </section>

          <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black">Meus Dashboards</h2>
                <p className="mt-1 text-sm text-slate-400">Crie dashboards isolados por usuário, cliente ou operação.</p>
              </div>
              <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-3 text-sm font-black text-white shadow-[0_0_30px_rgba(0,212,255,0.2)]">
                <Plus size={16} />
                Novo dashboard
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {['Dashboard de tráfego', 'Cliente premium', 'Relatório mensal'].map((title, index) => (
                <div key={title} className="rounded-3xl border border-white/10 bg-[#0b0d14] p-5">
                  <div className="mb-6 h-28 rounded-2xl bg-[linear-gradient(135deg,rgba(0,212,255,0.18),rgba(167,139,250,0.12))]" />
                  <p className="font-black">{title}</p>
                  <p className="mt-1 text-sm text-slate-500">{index === 0 ? 'Template inicial' : 'Placeholder editável'}</p>
                  <div className="mt-4 flex gap-2">
                    <button className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300">Editar layout</button>
                    <button className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300">Widgets</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-lg font-black">Estrutura editável preparada</h2>
              <p className="mt-2 text-sm text-slate-400">Base criada para adicionar cards, mover widgets, redimensionar elementos e salvar layouts por usuário sem tocar na dashboard atual.</p>
            </div>
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-lg font-black">Billing preparado</h2>
              <p className="mt-2 text-sm text-slate-400">Arquitetura pronta para assinatura mensal, upgrade, downgrade, portal de cobrança e webhooks futuros do Stripe.</p>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
