'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, ChevronDown, ChevronUp, LayoutDashboard, Lock, Mail, Shield, UserPlus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type UserProfile = {
  id: string
  email: string | null
  nome: string | null
  created_at: string
}

type Projeto = {
  id: string
  nome: string
}

type PermRow = {
  pode_visualizar: boolean
  pode_editar_layout: boolean
  pode_adicionar_widgets: boolean
  pode_configurar_produtos: boolean
  pode_ver_produtos_ofertas: boolean
  pode_excluir_dashboard: boolean
  is_admin_dashboard: boolean
}

type StoredPerm = PermRow & { projeto_id: string }

const DEFAULT_PERM: PermRow = {
  pode_visualizar: true,
  pode_editar_layout: false,
  pode_adicionar_widgets: false,
  pode_configurar_produtos: false,
  pode_ver_produtos_ofertas: false,
  pode_excluir_dashboard: false,
  is_admin_dashboard: false,
}

const PERM_KEYS: { key: keyof Omit<PermRow, 'is_admin_dashboard'>; label: string }[] = [
  { key: 'pode_visualizar', label: 'Visualizar' },
  { key: 'pode_editar_layout', label: 'Editar layout' },
  { key: 'pode_adicionar_widgets', label: 'Adicionar widgets' },
  { key: 'pode_configurar_produtos', label: 'Configurar produtos' },
  { key: 'pode_ver_produtos_ofertas', label: 'Ver produtos e ofertas' },
  { key: 'pode_excluir_dashboard', label: 'Excluir dashboard' },
]

type DashboardEntry = { id: string; nome: string; data_criacao: string }

function PermissionsProjectList({
  projetos,
  perms,
  onToggle,
  onSetPerm,
}: {
  projetos: Projeto[]
  perms: Record<string, PermRow>
  onToggle: (id: string, checked: boolean) => void
  onSetPerm: (id: string, key: keyof PermRow, value: boolean) => void
}) {
  if (projetos.length === 0) {
    return <p className="py-6 text-center text-xs text-slate-500">Nenhum projeto criado ainda.</p>
  }

  return (
    <div className="space-y-2">
      {projetos.map(projeto => {
        const hasAccess = !!perms[projeto.id]
        const perm = perms[projeto.id]
        return (
          <div
            key={projeto.id}
            className={`overflow-hidden rounded-2xl border transition-all ${
              hasAccess ? 'border-cyan-400/25 bg-cyan-400/[0.04]' : 'border-white/8 bg-white/[0.02]'
            }`}
          >
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  hasAccess ? 'border-cyan-400 bg-cyan-400/20' : 'border-white/15'
                }`}
              >
                {hasAccess && <Check size={11} className="text-cyan-400" />}
              </span>
              <span className="flex flex-1 items-center gap-2 text-sm font-medium text-slate-200">
                <LayoutDashboard size={13} className="shrink-0 text-slate-500" />
                {projeto.nome}
              </span>
              <input
                type="checkbox"
                className="sr-only"
                checked={hasAccess}
                onChange={e => onToggle(projeto.id, e.target.checked)}
              />
            </label>

            {hasAccess && perm && (
              <div className="border-t border-white/8 px-4 pb-3 pt-2.5">
                {/* Admin total */}
                <label className="mb-2.5 flex cursor-pointer items-center gap-2">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      perm.is_admin_dashboard ? 'border-violet-400 bg-violet-400/20' : 'border-white/15'
                    }`}
                  >
                    {perm.is_admin_dashboard && <Check size={10} className="text-violet-400" />}
                  </span>
                  <span className="text-xs font-bold text-violet-300">Admin total (marca tudo)</span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={perm.is_admin_dashboard}
                    onChange={e => onSetPerm(projeto.id, 'is_admin_dashboard', e.target.checked)}
                  />
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PERM_KEYS.map(({ key, label }) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          perm[key] ? 'border-cyan-400 bg-cyan-400/20' : 'border-white/15'
                        }`}
                      >
                        {perm[key] && <Check size={10} className="text-cyan-400" />}
                      </span>
                      <span className="text-xs text-slate-400">{label}</span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={perm[key]}
                        onChange={e => onSetPerm(projeto.id, key, e.target.checked)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [allProjetos, setAllProjetos] = useState<Projeto[]>([])

  // Expandable dashboards per user
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [userDashboards, setUserDashboards] = useState<Record<string, DashboardEntry[]>>({})
  const [loadingDashboards, setLoadingDashboards] = useState<string | null>(null)

  // Invite
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitePerms, setInvitePerms] = useState<Record<string, PermRow>>({})
  const [inviting, setInviting] = useState(false)
  const [inviteStatus, setInviteStatus] = useState('')

  // Permissions modal
  const [editPermsUser, setEditPermsUser] = useState<UserProfile | null>(null)
  const [editPerms, setEditPerms] = useState<Record<string, PermRow>>({})
  const [loadingPerms, setLoadingPerms] = useState(false)
  const [savingPerms, setSavingPerms] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.role !== 'admin') { setIsAdmin(false); return }
      setIsAdmin(true)

      const [{ data: allUsers }, { data: projetos }] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('id, email, nome, created_at')
          .eq('role', 'user')
          .order('created_at', { ascending: false }),
        supabase
          .from('projetos')
          .select('id, nome')
          .order('ordem', { ascending: true })
          .order('data_criacao', { ascending: false }),
      ])

      setUsers((allUsers ?? []) as UserProfile[])
      setAllProjetos((projetos ?? []) as Projeto[])
    }
    init()
  }, [router])

  async function toggleDashboards(userId: string) {
    if (expandedUser === userId) { setExpandedUser(null); return }
    if (userDashboards[userId]) { setExpandedUser(userId); return }

    setLoadingDashboards(userId)
    const res = await fetch(`/api/admin/dashboards?user_id=${encodeURIComponent(userId)}`)
    const json = await res.json() as { dashboards?: DashboardEntry[] }
    setUserDashboards(prev => ({ ...prev, [userId]: json.dashboards ?? [] }))
    setExpandedUser(userId)
    setLoadingDashboards(null)
  }

  async function openEditPerms(u: UserProfile) {
    setEditPermsUser(u)
    setEditPerms({})
    setLoadingPerms(true)
    const res = await fetch(`/api/admin/permissions?user_id=${encodeURIComponent(u.id)}`)
    const json = await res.json() as { permissions?: StoredPerm[] }
    const map: Record<string, PermRow> = {}
    ;(json.permissions ?? []).forEach(p => {
      map[p.projeto_id] = {
        pode_visualizar: p.pode_visualizar,
        pode_editar_layout: p.pode_editar_layout,
        pode_adicionar_widgets: p.pode_adicionar_widgets,
        pode_configurar_produtos: p.pode_configurar_produtos,
        pode_ver_produtos_ofertas: p.pode_ver_produtos_ofertas,
        pode_excluir_dashboard: p.pode_excluir_dashboard,
        is_admin_dashboard: p.is_admin_dashboard,
      }
    })
    setEditPerms(map)
    setLoadingPerms(false)
  }

  function handleToggleProject(
    state: Record<string, PermRow>,
    setState: (v: Record<string, PermRow>) => void,
    projetoId: string,
    checked: boolean,
  ) {
    if (checked) {
      setState({ ...state, [projetoId]: { ...DEFAULT_PERM } })
    } else {
      const next = { ...state }
      delete next[projetoId]
      setState(next)
    }
  }

  function handleSetPerm(
    state: Record<string, PermRow>,
    setState: (v: Record<string, PermRow>) => void,
    projetoId: string,
    key: keyof PermRow,
    value: boolean,
  ) {
    const current = state[projetoId]
    if (!current) return
    if (key === 'is_admin_dashboard' && value) {
      setState({
        ...state,
        [projetoId]: {
          pode_visualizar: true,
          pode_editar_layout: true,
          pode_adicionar_widgets: true,
          pode_configurar_produtos: true,
          pode_ver_produtos_ofertas: true,
          pode_excluir_dashboard: true,
          is_admin_dashboard: true,
        },
      })
    } else {
      setState({ ...state, [projetoId]: { ...current, [key]: value } })
    }
  }

  async function savePermissoes() {
    if (!editPermsUser) return
    setSavingPerms(true)
    const permissions = Object.entries(editPerms).map(([projeto_id, p]) => ({ projeto_id, ...p }))
    await fetch('/api/admin/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: editPermsUser.id, permissions }),
    })
    setSavingPerms(false)
    setEditPermsUser(null)
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteStatus('')
    const permissoes = Object.entries(invitePerms).map(([projeto_id, p]) => ({ projeto_id, ...p }))
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), permissoes }),
    })
    const json = await res.json() as { error?: string }
    setInviting(false)
    if (res.ok) {
      setInviteStatus(`Convite enviado para ${inviteEmail}`)
      setInviteEmail('')
      setInvitePerms({})
    } else {
      setInviteStatus(json.error ?? 'Erro ao enviar convite')
    }
  }

  if (isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07080d]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#07080d] text-white">
        <Shield size={40} className="text-red-400" />
        <p className="text-lg font-bold">Acesso negado</p>
        <Link href="/dashboard" className="text-sm text-cyan-400 hover:underline">Voltar ao dashboard</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#07080d] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07080d]/80 px-6 py-4 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-200/70">Administração</p>
            <h1 className="mt-0.5 text-xl font-black">Usuários cadastrados</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setShowInvite(true); setInviteStatus(''); setInvitePerms({}) }}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-cyan-500/20"
            >
              <UserPlus size={15} />
              Adicionar usuário
            </button>
            <Link href="/dashboard" className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white">
              Voltar
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
          <p className="text-sm text-slate-400">
            {users.length} {users.length === 1 ? 'usuário convidado' : 'usuários convidados'}
          </p>
        </div>

        <div className="space-y-2">
          {users.map(user => (
            <div key={user.id} className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-sm font-black text-cyan-300">
                  {(user.nome ?? user.email ?? '?')[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-100">{user.nome ?? '—'}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                    <Mail size={11} />
                    {user.email ?? '—'}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-slate-500">
                  {new Date(user.created_at).toLocaleDateString('pt-BR')}
                </p>
                <button
                  onClick={() => openEditPerms(user)}
                  className="flex shrink-0 items-center gap-2 rounded-xl border border-violet-400/25 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-300 transition-colors hover:border-violet-400/50 hover:text-violet-200"
                >
                  <Lock size={12} />
                  Editar permissões
                </button>
                <button
                  onClick={() => toggleDashboards(user.id)}
                  className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-cyan-300/30 hover:text-cyan-200"
                >
                  <LayoutDashboard size={13} />
                  Dashboards
                  {loadingDashboards === user.id ? (
                    <div className="h-3 w-3 animate-spin rounded-full border border-cyan-400 border-t-transparent" />
                  ) : expandedUser === user.id ? (
                    <ChevronUp size={13} />
                  ) : (
                    <ChevronDown size={13} />
                  )}
                </button>
              </div>
              {expandedUser === user.id && (
                <div className="border-t border-white/8 px-5 py-3">
                  {!userDashboards[user.id] || userDashboards[user.id].length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhum dashboard criado.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {userDashboards[user.id].map(db => (
                        <Link
                          key={db.id}
                          href={`/dashboard/${db.id}`}
                          className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm text-slate-300 transition-colors hover:border-cyan-300/20 hover:text-white"
                        >
                          <LayoutDashboard size={13} className="text-cyan-400" />
                          <span className="flex-1">{db.nome}</span>
                          <span className="text-xs text-slate-600">
                            {new Date(db.data_criacao).toLocaleDateString('pt-BR')}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {users.length === 0 && (
            <p className="py-12 text-center text-slate-500">Nenhum usuário convidado ainda.</p>
          )}
        </div>
      </main>

      {/* Invite modal */}
      {showInvite && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setShowInvite(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#10101d] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <h3 className="font-black text-slate-100">Adicionar usuário</h3>
                <p className="text-xs text-slate-500">Enviar convite por email</p>
              </div>
              <button
                onClick={() => setShowInvite(false)}
                className="rounded-xl p-2 text-slate-500 hover:bg-white/5 hover:text-slate-200"
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-slate-400">Email do usuário</span>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendInvite() }}
                    placeholder="usuario@email.com"
                    className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400/50"
                  />
                </label>

                <div>
                  <p className="mb-3 text-xs font-semibold text-slate-400">
                    Dashboards e permissões iniciais{' '}
                    <span className="font-normal text-slate-600">(opcional)</span>
                  </p>
                  <PermissionsProjectList
                    projetos={allProjetos}
                    perms={invitePerms}
                    onToggle={(id, checked) =>
                      handleToggleProject(invitePerms, setInvitePerms, id, checked)
                    }
                    onSetPerm={(id, key, value) =>
                      handleSetPerm(invitePerms, setInvitePerms, id, key, value)
                    }
                  />
                </div>

                {inviteStatus && (
                  <p className={`text-xs ${inviteStatus.startsWith('Convite') ? 'text-cyan-400' : 'text-red-400'}`}>
                    {inviteStatus}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-white/8 p-5">
              <button
                onClick={sendInvite}
                disabled={!inviteEmail.trim() || inviting}
                className="h-11 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-500 text-sm font-black text-white shadow-lg shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {inviting ? 'Enviando...' : 'Enviar convite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permissions modal */}
      {editPermsUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => { if (!savingPerms) setEditPermsUser(null) }}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#10101d] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <h3 className="font-black text-slate-100">Permissões por dashboard</h3>
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Mail size={11} />
                  {editPermsUser.nome ?? editPermsUser.email}
                </p>
              </div>
              <button
                onClick={() => setEditPermsUser(null)}
                disabled={savingPerms}
                className="rounded-xl p-2 text-slate-500 hover:bg-white/5 hover:text-slate-200"
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {loadingPerms ? (
                <div className="flex h-40 items-center justify-center">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                </div>
              ) : (
                <PermissionsProjectList
                  projetos={allProjetos}
                  perms={editPerms}
                  onToggle={(id, checked) =>
                    handleToggleProject(editPerms, setEditPerms, id, checked)
                  }
                  onSetPerm={(id, key, value) =>
                    handleSetPerm(editPerms, setEditPerms, id, key, value)
                  }
                />
              )}
            </div>

            <div className="flex gap-2 border-t border-white/8 p-5">
              <button
                onClick={() => setEditPermsUser(null)}
                disabled={savingPerms}
                className="h-11 flex-1 rounded-2xl border border-white/10 text-sm font-semibold text-slate-400 hover:text-white disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={savePermissoes}
                disabled={savingPerms || loadingPerms}
                className="h-11 flex-1 rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-500 text-sm font-black text-white shadow-lg shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingPerms ? 'Salvando...' : 'Salvar permissões'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
