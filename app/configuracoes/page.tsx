'use client'

import { useState, useEffect } from 'react'
import {
  Settings,
  Save,
  KeyRound,
  Building2,
  User,
  Mail,
  Check,
  AlertCircle,
  Bell,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Projeto } from '@/lib/types'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'

type Configuracoes = {
  id: string
  nome_empresa: string | null
  nome_proprietario: string | null
  email: string | null
  updated_at: string | null
}

type NotifPrefRow = {
  venda_realizada: boolean
  boleto_gerado: boolean
  pix_gerado: boolean
  vendas_pendentes: boolean
  reembolso: boolean
  venda_cancelada: boolean
}

const NOTIF_CATEGORIES: { key: keyof NotifPrefRow; label: string }[] = [
  { key: 'venda_realizada', label: 'Venda realizada' },
  { key: 'boleto_gerado', label: 'Boleto gerado' },
  { key: 'pix_gerado', label: 'Pix gerado' },
  { key: 'vendas_pendentes', label: 'Vendas pendentes' },
  { key: 'reembolso', label: 'Reembolso' },
  { key: 'venda_cancelada', label: 'Venda cancelada' },
]

const DEFAULT_NOTIF_PREF: NotifPrefRow = {
  venda_realizada: false,
  boleto_gerado: false,
  pix_gerado: false,
  vendas_pendentes: false,
  reembolso: false,
  venda_cancelada: false,
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [nomeProprietario, setNomeProprietario] = useState('')
  const [email, setEmail] = useState('')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const [notifProjetos, setNotifProjetos] = useState<Projeto[]>([])
  const [notifPrefs, setNotifPrefs] = useState<Record<string, NotifPrefRow>>({})
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined') return 'default'
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return 'unsupported'
    }
    return Notification.permission
  })
  // Só true depois de confirmar uma inscrição de verdade (getSubscription) — não basta
  // Notification.permission estar 'granted', porque essa permissão fica salva no
  // navegador mesmo depois de remover e readicionar o ícone da Tela de Início no
  // iOS, e nesse caso a inscrição antiga pode ter ficado órfã (o navegador cria um
  // novo contexto isolado). Confiar só na permissão escondia o botão de reativar
  // mesmo sem nenhuma inscrição válida por trás.
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushError, setPushError] = useState('')
  // No iOS, push só entrega de verdade se o site foi instalado na Tela de Início e
  // aberto por esse ícone — pela aba comum do Safari, o navegador pode até aceitar a
  // inscrição sem erro nenhum e a notificação simplesmente nunca chega no aparelho,
  // sem nenhum aviso do lado do servidor. Detecta isso pra reforçar o aviso sempre
  // visível, mesmo que a inscrição pareça "ativada".
  const [isIosNotStandalone] = useState(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    return isIos && !isStandalone
  })
  const [activatingPush, setActivatingPush] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsSaved, setPrefsSaved] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    navigator.serviceWorker.getRegistration('/sw.js')
      .then(registration => registration?.pushManager.getSubscription() ?? null)
      .then(subscription => setPushSubscribed(!!subscription))
      .catch(() => setPushSubscribed(false))
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return setLoading(false)
      setUserId(user.id)
      supabase
        .from('configuracoes')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            const config = data as Configuracoes
            setNomeEmpresa(config.nome_empresa ?? '')
            setNomeProprietario(config.nome_proprietario ?? '')
            setEmail(config.email ?? '')
          }
          setLoading(false)
        })
    })

    async function loadNotifSettings() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      const isAdmin = (profile as { role?: string } | null)?.role === 'admin'

      let projetos: Projeto[] = []
      if (isAdmin) {
        const { data } = await supabase.from('projetos').select('*').order('nome')
        projetos = (data ?? []) as Projeto[]
      } else {
        const { data: perms } = await supabase
          .from('user_dashboard_permissions')
          .select('projeto_id')
          .eq('user_id', user.id)
          .eq('pode_visualizar', true)
        const projetoIds = ((perms ?? []) as { projeto_id: string }[]).map(p => p.projeto_id)
        if (projetoIds.length > 0) {
          const { data } = await supabase.from('projetos').select('*').in('id', projetoIds).order('nome')
          projetos = (data ?? []) as Projeto[]
        }
      }
      setNotifProjetos(projetos)

      const res = await fetch('/api/notifications/preferences')
      const json = await res.json() as { preferences?: (NotifPrefRow & { projeto_id: string })[] }
      const prefsMap: Record<string, NotifPrefRow> = {}
      ;(json.preferences ?? []).forEach(p => {
        prefsMap[p.projeto_id] = {
          venda_realizada: p.venda_realizada,
          boleto_gerado: p.boleto_gerado,
          pix_gerado: p.pix_gerado,
          vendas_pendentes: p.vendas_pendentes,
          reembolso: p.reembolso,
          venda_cancelada: p.venda_cancelada,
        }
      })
      setNotifPrefs(prefsMap)
    }
    void loadNotifSettings()
  }, [])

  const activatePush = async () => {
    if (pushPermission === 'unsupported') return
    setActivatingPush(true)
    setPushError('')
    try {
      const permission = await Notification.requestPermission()
      setPushPermission(permission)
      if (permission !== 'granted') return

      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const applicationServerKey = urlBase64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      )
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      })

      const res = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      if (!res.ok) throw new Error('Não foi possível salvar a inscrição no servidor.')
      setPushSubscribed(true)
    } catch (err) {
      setPushSubscribed(false)
      setPushError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Permissão de notificação negada pelo navegador.'
          : 'Não foi possível ativar as notificações. Tente remover e readicionar o site à Tela de Início, depois tente de novo.',
      )
    } finally {
      setActivatingPush(false)
    }
  }

  function toggleNotifPref(projetoId: string, key: keyof NotifPrefRow) {
    setNotifPrefs(prev => ({
      ...prev,
      [projetoId]: {
        ...(prev[projetoId] ?? DEFAULT_NOTIF_PREF),
        [key]: !(prev[projetoId]?.[key] ?? false),
      },
    }))
  }

  const saveNotifPrefs = async () => {
    setSavingPrefs(true)
    setPrefsSaved(false)
    const preferences = notifProjetos.map(p => ({
      projeto_id: p.id,
      ...(notifPrefs[p.id] ?? DEFAULT_NOTIF_PREF),
    }))
    await fetch('/api/notifications/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences }),
    })
    setSavingPrefs(false)
    setPrefsSaved(true)
    setTimeout(() => setPrefsSaved(false), 3000)
  }

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)
    setSaved(false)
    await supabase.from('configuracoes').upsert({
      id: userId,
      nome_empresa: nomeEmpresa.trim() || null,
      nome_proprietario: nomeProprietario.trim() || null,
      email: email.trim() || null,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handlePasswordChange = async () => {
    if (!newPassword) return
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'As senhas não coincidem.' })
      return
    }
    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'A senha deve ter pelo menos 6 caracteres.' })
      return
    }
    setSavingPassword(true)
    setPasswordMessage(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)
    if (error) {
      setPasswordMessage({ type: 'error', text: error.message })
    } else {
      setPasswordMessage({ type: 'success', text: 'Senha alterada com sucesso.' })
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  return (
    <div className="min-h-screen">
      <header
        className="border-b"
        style={{
          borderColor: 'rgba(255,255,255,0.07)',
          background: 'rgba(11,11,20,0.95)',
        }}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2.5 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
            <Settings size={15} className="text-indigo-400" />
          </div>
          <span className="text-sm font-bold text-slate-100">Configurações</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        {loading ? (
          <div className="flex h-52 items-center justify-center">
            <Spinner size={28} />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Informações da Empresa */}
            <section
              className="rounded-2xl border p-6"
              style={{ background: '#191929', borderColor: 'rgba(255,255,255,0.07)' }}
            >
              <div className="mb-5 flex items-center gap-2">
                <Building2 size={16} className="text-indigo-400" />
                <h2 className="text-sm font-semibold text-slate-200">Informações da Empresa</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <Building2 size={11} />
                    Nome da empresa
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Minha Empresa Ltda"
                    value={nomeEmpresa}
                    onChange={e => setNomeEmpresa(e.target.value)}
                    className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
                    style={{ background: '#111120' }}
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <User size={11} />
                    Nome do proprietário
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: João Silva"
                    value={nomeProprietario}
                    onChange={e => setNomeProprietario(e.target.value)}
                    className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
                    style={{ background: '#111120' }}
                  />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <Mail size={11} />
                    E-mail
                  </label>
                  <input
                    type="email"
                    placeholder="contato@empresa.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
                    style={{ background: '#111120' }}
                  />
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <Button onClick={handleSave} disabled={saving || !userId} size="sm">
                    {saving ? (
                      <Spinner size={14} />
                    ) : saved ? (
                      <Check size={14} />
                    ) : (
                      <Save size={14} />
                    )}
                    {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar alterações'}
                  </Button>
                  {saved && (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <Check size={12} />
                      Informações salvas com sucesso
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* Segurança */}
            <section
              className="rounded-2xl border p-6"
              style={{ background: '#191929', borderColor: 'rgba(255,255,255,0.07)' }}
            >
              <div className="mb-5 flex items-center gap-2">
                <KeyRound size={16} className="text-indigo-400" />
                <h2 className="text-sm font-semibold text-slate-200">Segurança</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Nova senha
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
                    style={{ background: '#111120' }}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Confirmar nova senha
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handlePasswordChange()}
                    className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
                    style={{ background: '#111120' }}
                  />
                </div>

                {passwordMessage && (
                  <div
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs ${
                      passwordMessage.type === 'success'
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {passwordMessage.type === 'success' ? (
                      <Check size={12} />
                    ) : (
                      <AlertCircle size={12} />
                    )}
                    {passwordMessage.text}
                  </div>
                )}

                <Button
                  onClick={handlePasswordChange}
                  disabled={savingPassword || !newPassword}
                  size="sm"
                  variant="outline"
                >
                  {savingPassword && <Spinner size={14} />}
                  Alterar senha
                </Button>
              </div>
            </section>

            {/* Notificações */}
            <section
              className="rounded-2xl border p-6"
              style={{ background: '#191929', borderColor: 'rgba(255,255,255,0.07)' }}
            >
              <div className="mb-5 flex items-center gap-2">
                <Bell size={16} className="text-indigo-400" />
                <h2 className="text-sm font-semibold text-slate-200">Notificações</h2>
              </div>

              <div className="space-y-4">
                {isIosNotStandalone && (
                  <div className="flex items-start gap-2.5 rounded-xl border-2 border-amber-500/40 bg-amber-500/15 px-3.5 py-3 text-xs text-amber-200">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-amber-100">
                        Você está pelo navegador, não pelo app instalado
                      </p>
                      <p className="mt-1">
                        No iPhone/iPad, notificações só chegam de verdade quando o site é aberto
                        pelo ícone da <strong>Tela de Início</strong> — pela aba comum do Safari, a
                        notificação pode parecer ativada e simplesmente nunca chegar, sem nenhum
                        aviso de erro. Toque em Compartilhar → &quot;Adicionar à Tela de Início&quot;,
                        depois abra o site por esse ícone antes de ativar as notificações.
                      </p>
                    </div>
                  </div>
                )}
                {pushPermission === 'unsupported' && !isIosNotStandalone && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
                    <AlertCircle size={12} />
                    No iPhone/iPad, notificações só funcionam depois de adicionar este site à Tela de Início (menu do navegador → &quot;Adicionar à Tela de Início&quot;) e abrir por esse ícone, em vez da aba do navegador. Depois de abrir por lá, volte nesta tela para ativar.
                  </div>
                )}
                {pushPermission === 'denied' && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
                    <AlertCircle size={12} />
                    Você bloqueou as notificações neste navegador. Para ativar, permita notificações para este site nas configurações do navegador.
                  </div>
                )}
                {pushSubscribed ? (
                  <div className="flex items-center gap-2 rounded-xl bg-green-500/10 px-3 py-2.5 text-xs text-green-400">
                    <Check size={12} />
                    Notificações ativadas neste dispositivo
                  </div>
                ) : pushPermission !== 'unsupported' && pushPermission !== 'denied' ? (
                  <Button onClick={activatePush} disabled={activatingPush} size="sm" variant="outline">
                    {activatingPush ? <Spinner size={14} /> : <Bell size={14} />}
                    Ativar notificações push
                  </Button>
                ) : null}
                {pushError && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
                    <AlertCircle size={12} />
                    {pushError}
                  </div>
                )}

                {notifProjetos.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhum projeto disponível para configurar notificações.</p>
                ) : (
                  <div className="space-y-2 pt-1">
                    {notifProjetos.map(projeto => {
                      const pref = notifPrefs[projeto.id] ?? DEFAULT_NOTIF_PREF
                      return (
                        <div
                          key={projeto.id}
                          className="rounded-xl border p-3.5"
                          style={{ background: '#111120', borderColor: 'rgba(255,255,255,0.07)' }}
                        >
                          <p className="mb-2 text-xs font-bold text-slate-200">{projeto.nome}</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {NOTIF_CATEGORIES.map(({ key, label }) => (
                              <label key={key} className="flex cursor-pointer items-center gap-2">
                                <span
                                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                    pref[key] ? 'border-cyan-400 bg-cyan-400/20' : 'border-white/15'
                                  }`}
                                >
                                  {pref[key] && <Check size={10} className="text-cyan-400" />}
                                </span>
                                <span className="text-xs text-slate-400">{label}</span>
                                <input
                                  type="checkbox"
                                  className="sr-only"
                                  checked={pref[key]}
                                  onChange={() => toggleNotifPref(projeto.id, key)}
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {notifProjetos.length > 0 && (
                  <div className="flex items-center gap-3 pt-1">
                    <Button onClick={saveNotifPrefs} disabled={savingPrefs} size="sm">
                      {savingPrefs ? <Spinner size={14} /> : prefsSaved ? <Check size={14} /> : <Save size={14} />}
                      {savingPrefs ? 'Salvando...' : prefsSaved ? 'Salvo!' : 'Salvar preferências'}
                    </Button>
                    {prefsSaved && (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <Check size={12} />
                        Preferências salvas com sucesso
                      </span>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
