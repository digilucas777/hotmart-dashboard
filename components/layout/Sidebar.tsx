'use client'

import { useState, useEffect, useRef } from 'react'
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
  Target,
  ChevronDown,
  Folder,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchFolders, fetchFolderProjetoIds } from '@/lib/dashboard-folders'
import type { DashboardFolder } from '@/lib/dashboard-folders'

const NAV_ITEMS = [
  { icon: LayoutGrid, label: 'Dashboards', href: '/dashboard' },
  { icon: ShoppingCart, label: 'Vendas', href: '/vendas' },
  { icon: FileText, label: 'Relatórios', href: '/relatorios' },
  { icon: Radio, label: 'Sites', href: '/sites' },
  { icon: Target, label: 'Rastreamento', href: '/rastreamento' },
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
  const [folders, setFolders] = useState<DashboardFolder[]>([])
  const [folderProjetos, setFolderProjetos] = useState<Record<string, string[]>>({})
  const [allProjetosSidebar, setAllProjetosSidebar] = useState<{ id: string; nome: string }[]>([])
  // Menu tipo UTMify: passar o mouse em cima de "Dashboards" abre um painel flutuante com
  // as pastas e os projetos dentro — não precisa clicar em nada pra ver a árvore inteira.
  const [showFlyout, setShowFlyout] = useState(false)
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number } | null>(null)
  const dashboardsRowRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const router = useRouter()

  async function refetchFolderData() {
    const [foldersData, projetosMap, projetosRes] = await Promise.all([
      fetchFolders(),
      fetchFolderProjetoIds(),
      supabase.from('projetos').select('id, nome').is('deleted_at', null).order('nome'),
    ])
    setFolders(foldersData)
    setFolderProjetos(projetosMap)
    setAllProjetosSidebar((projetosRes.data ?? []) as { id: string; nome: string }[])
  }

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
      if (admin) {
        setIsAdmin(true)
        setCanSeeVendas(true)
        await refetchFolderData()
        return
      }
      // Mesmo critério do /vendas: precisa ter acesso ao dashboard (pode_visualizar) E o
      // checkbox "Ver aba Vendas" marcado (pode_ver_vendas) em pelo menos um projeto.
      const { data: perms } = await supabase
        .from('user_dashboard_permissions')
        .select('pode_visualizar')
        .eq('user_id', user.id)
        .eq('pode_visualizar', true)
        .eq('pode_ver_vendas', true)
        .limit(1)
      setCanSeeVendas((perms ?? []).length > 0)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    function handleFoldersChanged() {
      void refetchFolderData().catch(() => {})
    }
    window.addEventListener('dashboard-folders-changed', handleFoldersChanged)
    return () => window.removeEventListener('dashboard-folders-changed', handleFoldersChanged)
  }, [isAdmin])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // "/dashboard" (Meus Dashboards) também mostra o menu agora — encolhido em ícones,
  // expande ao passar o mouse, igual em toda a aplicação.
  const hiddenRoutes = ['/', '/login', '/register', '/forgot-password', '/pricing']
  if (hiddenRoutes.includes(pathname)) return null

  const visibleNavItems = NAV_ITEMS.filter(item => {
    if (item.href === '/vendas') return isAdmin || canSeeVendas
    if (item.href === '/integracoes') return isAdmin
    return true
  })

  const hasVisibleFolders = folders.some(folder =>
    (folderProjetos[folder.id] ?? []).some(id => allProjetosSidebar.some(p => p.id === id)),
  )

  function openFlyout() {
    const rect = dashboardsRowRef.current?.getBoundingClientRect()
    if (rect) setFlyoutPos({ top: rect.top, left: rect.right + 8 })
    setShowFlyout(true)
  }

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
          if (item.href === '/dashboard' && isAdmin) {
            return (
              <div
                key={item.href}
                ref={dashboardsRowRef}
                onMouseEnter={hasVisibleFolders ? openFlyout : undefined}
                onMouseLeave={hasVisibleFolders ? () => setShowFlyout(false) : undefined}
              >
                <Link
                  href={item.href}
                  title={item.label}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                    active ? 'text-cyan-100' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                  }`}
                  style={active ? { background: 'linear-gradient(135deg, rgba(0,212,255,0.12), rgba(139,92,246,0.12))' } : undefined}
                >
                  <Icon size={17} className="flex-shrink-0" />
                  <span className="app-sidebar-label flex-1 text-sm font-medium">{item.label}</span>
                  {hasVisibleFolders && <ChevronDown size={14} className="app-sidebar-label shrink-0" />}
                </Link>

                {showFlyout && hasVisibleFolders && flyoutPos && (
                  <div
                    className="w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f16] py-2 shadow-2xl shadow-black/60"
                    style={{ position: 'fixed', top: flyoutPos.top, left: flyoutPos.left, zIndex: 60 }}
                  >
                    {folders.map(folder => {
                      const idsNaPasta = folderProjetos[folder.id] ?? []
                      const projetosDaPasta = allProjetosSidebar.filter(p => idsNaPasta.includes(p.id))
                      if (projetosDaPasta.length === 0) return null
                      return (
                        <div key={folder.id} className="px-2 py-1">
                          <p className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-cyan-200/70">
                            <Folder size={11} />
                            {folder.nome}
                          </p>
                          {projetosDaPasta.map(projeto => (
                            <Link
                              key={projeto.id}
                              href={`/dashboard/${projeto.id}`}
                              onClick={() => setShowFlyout(false)}
                              className="block truncate rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                            >
                              {projeto.nome}
                            </Link>
                          ))}
                        </div>
                      )
                    })}
                    <div className="mt-1 border-t border-white/5 px-2 pt-2">
                      <Link
                        href="/dashboard"
                        onClick={() => setShowFlyout(false)}
                        className="block rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white/5 hover:text-slate-300"
                      >
                        Ver todos os dashboards
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )
          }
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
