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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'

type Configuracoes = {
  id: string
  nome_empresa: string | null
  nome_proprietario: string | null
  email: string | null
  updated_at: string | null
}

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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

  useEffect(() => {
    supabase
      .from('configuracoes')
      .select('*')
      .eq('id', 'default')
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
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    await supabase.from('configuracoes').upsert({
      id: 'default',
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
                  <Button onClick={handleSave} disabled={saving} size="sm">
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
          </div>
        )}
      </main>
    </div>
  )
}
