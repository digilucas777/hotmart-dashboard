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
  Target,
  ChevronDown,
  ChevronRight,
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
  // Clicar em "Dashboards" abre a lista de pastas (só os nomes) dentro do próprio menu;
  // clicar numa pasta abre os projetos dela. Nada disso navega — só "Ver todos os
  // dashboards" no fim da lista (ou o ícone/atalho) leva pra /dashboard.
  const [dashboardsTreeOpen, setDashboardsTreeOpen] = useState(false)
  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(new Set())
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    try {
      const savedOpen = localStorage.getItem('sidebar_dashboards_tree_open')
      if (savedOpen === 'true') setDashboardsTreeOpen(true)
      const savedFolders = localStorage.getItem('sidebar_open_folder_ids')
      if (savedFolders) setOpenFolderIds(new Set(JSON.parse(savedFolders) as string[]))
    } catch {
      // localStorage indisponível (modo privado, etc) — segue com os padrões
    }
  }, [])

  function toggleDashboardsTree() {
    setDashboardsTreeOpen(prev => {
      const next = !prev
      try { localStorage.setItem('sidebar_dashboards_tree_open', String(next)) } catch { /* ignora */ }
      return next
    })
  }

  function toggleFolderOpen(folderId: string) {
    setOpenFolderIds(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      try { localStorage.setItem('sidebar_open_folder_ids', JSON.stringify(Array.from(next))) } catch { /* ignora */ }
      return next
    })
  }

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

  // "/dashboard" (Meus Dashboards) também mostra o menu — encolhido em ícones, expande
  // ao passar o mouse, igual em toda a aplicação.
  const hiddenRoutes = ['/', '/login', '/register', '/forgot-password', '/pricing']
  if (hiddenRoutes.includes(pathname)) return null

  const visibleNavItems = NAV_ITEMS.filter(item => {
    if (item.href === '/vendas') return isAdmin || canSeeVendas
    if (item.href === '/integracoes') return isAdmin
    return true
  })

  // Projetos sem pasta nenhuma — sempre por último na lista, mesmo com pastas novas.
  const idsComPasta = new Set(Object.values(folderProjetos).flat())
  const semPastaProjetos = allProjetosSidebar.filter(p => !idsComPasta.has(p.id))
  // Só ativa a árvore (setinha + lista) quando o admin já criou pelo menos uma pasta —
  // antes disso, "Sem pasta" seria só "todos os projetos", redundante com a lista normal.
  const hasAnyFolderContent = folders.length > 0 && (
    folders.some(folder => (folderProjetos[folder.id] ?? []).some(id => allProjetosSidebar.some(p => p.id === id)))
    || semPastaProjetos.length > 0
  )

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
      <nav className="app-sidebar-nav flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-3">
        {visibleNavItems.map(item => {
          const active = isNavActive(item.href, pathname)
          const Icon = item.icon
          if (item.href === '/dashboard' && isAdmin) {
            return (
              <div key={item.href}>
                <button
                  onClick={hasAnyFolderContent ? toggleDashboardsTree : () => router.push(item.href)}
                  title={item.label}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    active ? 'text-cyan-100' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
                  }`}
                  style={active ? { background: 'linear-gradient(135deg, rgba(0,212,255,0.12), rgba(139,92,246,0.12))' } : undefined}
                >
                  <Icon size={17} className="flex-shrink-0" />
                  <span className="app-sidebar-label flex-1 text-sm font-medium">{item.label}</span>
                  {hasAnyFolderContent && (
                    <span className="app-sidebar-label shrink-0">
                      {dashboardsTreeOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                  )}
                </button>

                {dashboardsTreeOpen && hasAnyFolderContent && (
                  <div className="app-sidebar-label ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                    {folders.map(folder => {
                      const idsNaPasta = folderProjetos[folder.id] ?? []
                      const projetosDaPasta = allProjetosSidebar.filter(p => idsNaPasta.includes(p.id))
                      if (projetosDaPasta.length === 0) return null
                      const folderOpen = openFolderIds.has(folder.id)
                      return (
                        <div key={folder.id}>
                          <button
                            onClick={() => toggleFolderOpen(folder.id)}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 hover:bg-white/5 hover:text-slate-200"
                          >
                            {folderOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                            <Folder size={12} className="shrink-0" />
                            <span className="truncate">{folder.nome}</span>
                          </button>
                          {folderOpen && (
                            <div className="ml-4 space-y-0.5 border-l border-white/5 pl-3">
                              {projetosDaPasta.map(projeto => (
                                <Link
                                  key={projeto.id}
                                  href={`/dashboard/${projeto.id}`}
                                  className="block truncate rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-white/5 hover:text-slate-200"
                                >
                                  {projeto.nome}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* "Sem pasta" sempre por último, não importa quantas pastas nomeadas existam */}
                    {semPastaProjetos.length > 0 && (() => {
                      const folderOpen = openFolderIds.has('__sem_pasta__')
                      return (
                        <div>
                          <button
                            onClick={() => toggleFolderOpen('__sem_pasta__')}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white/5 hover:text-slate-300"
                          >
                            {folderOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                            <Folder size={12} className="shrink-0" />
                            <span className="truncate">Sem pasta</span>
                          </button>
                          {folderOpen && (
                            <div className="ml-4 space-y-0.5 border-l border-white/5 pl-3">
                              {semPastaProjetos.map(projeto => (
                                <Link
                                  key={projeto.id}
                                  href={`/dashboard/${projeto.id}`}
                                  className="block truncate rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-white/5 hover:text-slate-200"
                                >
                                  {projeto.nome}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    <Link
                      href="/dashboard"
                      className="mt-1 block rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white/5 hover:text-slate-300"
                    >
                      Ver todos os dashboards
                    </Link>
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
