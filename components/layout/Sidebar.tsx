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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const NAV_ITEMS = [
  { icon: LayoutGrid, label: 'Dashboards', href: '/dashboard' },
  { icon: ShoppingCart, label: 'Vendas', href: '/vendas' },
  { icon: FileText, label: 'Relatórios', href: '/relatorios' },
  { icon: Plug, label: 'Integrações', href: '/integracoes' },
  { icon: Settings, label: 'Configurações', href: '/configuracoes' },
]

function isNavActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard' || pathname.startsWith('/dashboard/')
  return pathname.startsWith(href)
}

export function Sidebar() {
  const [expanded, setExpanded] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('configuracoes')
        .select('nome_empresa')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.nome_empresa) setCompanyName(data.nome_empresa as string)
        })
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const hiddenRoutes = ['/', '/login', '/register', '/forgot-password', '/pricing', '/dashboard']
  if (hiddenRoutes.includes(pathname)) return null

  return (
    <aside
      className="app-sidebar sticky top-0 z-50 flex h-screen flex-shrink-0 flex-col overflow-hidden"
      style={{
        width: expanded ? '220px' : '60px',
        transition: 'width 0.2s ease',
        background: '#07080d',
        borderRight: '1px solid rgba(255,255,255,0.07)',
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Logo */}
      <div
        className="app-sidebar-logo flex h-14 flex-shrink-0 items-center gap-3 px-[18px]"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/20">
          <LayoutDashboard size={15} className="text-white" />
        </div>
        <span
          className="whitespace-nowrap text-sm font-bold text-slate-100"
          style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.15s ease' }}
        >
          {companyName || 'Dash Speed'}
        </span>
      </div>

      {/* Nav */}
      <nav className="app-sidebar-nav flex flex-1 flex-col gap-0.5 p-2 pt-3">
        {NAV_ITEMS.map(item => {
          const active = isNavActive(item.href, pathname)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              title={!expanded ? item.label : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                active
                  ? 'text-cyan-100'
                  : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
              }`}
              style={active ? { background: 'linear-gradient(135deg, rgba(0,212,255,0.12), rgba(139,92,246,0.12))' } : undefined}
            >
              <Icon size={17} className="flex-shrink-0" />
              <span
                className="whitespace-nowrap text-sm font-medium"
                style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.15s ease' }}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="app-sidebar-logout p-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          onClick={handleLogout}
          title={!expanded ? 'Sair' : undefined}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut size={17} className="flex-shrink-0" />
          <span
            className="whitespace-nowrap text-sm font-medium"
            style={{ opacity: expanded ? 1 : 0, transition: 'opacity 0.15s ease' }}
          >
            Sair
          </span>
        </button>
      </div>
    </aside>
  )
}
