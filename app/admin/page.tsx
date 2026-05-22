'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, ChevronUp, LayoutDashboard, Mail, Shield, UserPlus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type UserProfile = {
  id: string
  email: string | null
  nome: string | null
  created_at: string
}

type Dashboard = {
  id: string
  nome: string
  descricao: string | null
  data_criacao: string
}

export default function AdminPage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [userDashboards, setUserDashboards] = useState<Record<string, Dashboard[]>>({})
  const [loadingDashboards, setLoadingDashboards] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteStatus, setInviteStatus] = useState('')

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

      const { data: allUsers } = await supabase
        .from('user_profiles')
        .select('id, email, nome, created_at')
        .order('created_at', { ascending: false })

      setUsers((allUsers ?? []) as UserProfile[])
    }
    init()
  }, [router])

  async function toggleDashboards(userId: string) {
    if (expandedUser === userId) { setExpandedUser(null); return }
    if (userDashboards[userId]) { setExpandedUser(userId); return }

    setLoadingDashboards(userId)
    const res = await fetch(`/api/admin/dashboards?user_id=${encodeURIComponent(userId)}`)
    const json = await res.json() as { dashboards?: Dashboard[] }
    setUserDashboards(prev => ({ ...prev, [userId]: json.dashboards ?? [] }))
    setExpandedUser(userId)
    setLoadingDashboards(null)
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteStatus('')
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    })
    const json = await res.json() as { error?: string }
    setInviting(false)
    if (res.ok) {
      setInviteStatus(`Convite enviado para ${inviteEmail}`)
      setInviteEmail('')
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
              onClick={() => { setShowInvite(true); setInviteStatus('') }}
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
            {users.length} {users.length === 1 ? 'usuário cadastrado' : 'usuários cadastrados'}
          </p>
        </div>

        <div className="space-y-2">
          {users.map(user => (
            <div key={user.id} className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
              <div className="flex items-center gap-4 px-5 py-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-sm font-black text-cyan-300">
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
                  onClick={() => toggleDashboards(user.id)}
                  className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-cyan-300/30 hover:text-cyan-200"
                >
                  <LayoutDashboard size={13} />
                  Ver dashboards
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
            <p className="py-12 text-center text-slate-500">Nenhum usuário encontrado.</p>
          )}
        </div>
      </main>

      {showInvite && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setShowInvite(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#10101d] shadow-2xl"
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
            <div className="space-y-4 p-5">
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
              {inviteStatus && (
                <p className={`text-xs ${inviteStatus.startsWith('Convite') ? 'text-cyan-400' : 'text-red-400'}`}>
                  {inviteStatus}
                </p>
              )}
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
    </div>
  )
}
