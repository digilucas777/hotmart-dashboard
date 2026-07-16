'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutGrid,
  ShoppingCart,
  FileText,
  Plug,
  Settings,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Radio,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const NAV_ITEMS = [
  { icon: LayoutGrid, label: 'Dashboards', href: '/dashboard' },
  { icon: ShoppingCart, label: 'Vendas', href: '/vendas' },
  { icon: FileText, label: 'Relatórios', href: '/relatorios' },
  { icon: Radio, label: 'Sites', href: '/sites' },
  { icon: Plug, label: 'Integrações', href: '/integracoes' },
  { icon: Settings, label: 'Configurações', href: '/configuracoes' },
]

function isNavActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard' || pathname.startsWith('/dashboard/')
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Sidebar() {
  const [companyName, setCompanyName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [canSeeVendas, setCanSeeVendas] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      supabase
        .from('configuracoes')
        .select('nome_empresa')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.nome_empresa) setCompanyName(data.nome_empresa as string)
        })
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      const admin = profile?.role === 'admin'
      if (admin) { setIsAdmin(true); setCanSeeVendas(true); return }
      // Mesmo critério do /vendas: acesso à aba = ter acesso a pelo menos um projeto
      // (pode_visualizar), não o checkbox separado pode_ver_vendas.
      const { data: perms } = await supabase
        .from('user_dashboard_permissions')
        .select('pode_visualizar')
        .eq('user_id', user.id)
        .eq('pode_visualizar', true)
        .limit(1)
      setCanSeeVendas((perms ?? []).length > 0)
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const hiddenRoutes = ['/', '/login', '/register', '/forgot-password', '/pricing', '/dashboard']
  if (hiddenRoutes.includes(pathname)) return null

  const visibleNavItems = NAV_ITEMS.filter(item => {
    if (item.href === '/vendas') return isAdmin || canSeeVendas
    if (item.href === '/integracoes') return isAdmin
    return true
  })

  return (
    <aside
      className="app-sidebar flex flex-shrink-0 flex-col overflow-hidden"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        zIndex: 50,
        background: '#07080d',
        borderRight: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Logo */}
      <div
        className="app-sidebar-logo flex h-14 flex-shrink-0 items-center gap-3 px-[18px]"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/20">
          <LayoutDashboard size={15} className="text-white" />
        </div>
        <span className="app-sidebar-label text-sm font-bold text-slate-100">
          {companyName || 'Dash Speed'}
        </span>
      </div>

      {/* Nav */}
      <nav className="app-sidebar-nav flex flex-1 flex-col gap-0.5 p-2 pt-3">
        {visibleNavItems.map(item => {
          const active = isNavActive(item.href, pathname)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                active
                  ? 'text-cyan-100'
                  : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
              }`}
              style={active ? { background: 'linear-gradient(135deg, rgba(0,212,255,0.12), rgba(139,92,246,0.12))' } : undefined}
            >
              <Icon size={17} className="flex-shrink-0" />
              <span className="app-sidebar-label text-sm font-medium">
                {item.label}
              </span>
            </Link>
          )
        })}
        {isAdmin && (
          <Link
            href="/admin"
            title="Admin"
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
              pathname === '/admin'
                ? 'text-cyan-100'
                : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
            }`}
            style={pathname === '/admin' ? { background: 'linear-gradient(135deg, rgba(0,212,255,0.12), rgba(139,92,246,0.12))' } : undefined}
          >
            <ShieldCheck size={17} className="flex-shrink-0" />
            <span className="app-sidebar-label text-sm font-medium">Admin</span>
          </Link>
        )}
      </nav>

      {/* Logout */}
      <div className="app-sidebar-logout p-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          onClick={handleLogout}
          title="Sair"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut size={17} className="flex-shrink-0" />
          <span className="app-sidebar-label text-sm font-medium">
            Sair
          </span>
        </button>
      </div>
    </aside>
  )
}
