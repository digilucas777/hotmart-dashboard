'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DashSpeedLogo } from '@/components/saas/DashSpeedLogo'

type Stage = 'loading' | 'form' | 'success' | 'error'

export default function AuthConfirmPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (!accessToken || !refreshToken) {
      setErrorMsg('Link de convite inválido ou expirado.')
      setStage('error')
      return
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          setErrorMsg('Não foi possível validar o convite. Solicite um novo.')
          setStage('error')
        } else {
          setStage('form')
        }
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')

    if (password.length < 6) {
      setErrorMsg('A senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setErrorMsg('As senhas não coincidem.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (error) {
      setErrorMsg(error.message)
      return
    }

    setStage('success')
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07080d] px-4 py-16 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(0,212,255,0.14),transparent_34rem),radial-gradient(circle_at_88%_12%,rgba(167,139,250,0.14),transparent_30rem)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <DashSpeedLogo />
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl">
          {stage === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              <p className="text-sm text-slate-400">Validando convite...</p>
            </div>
          )}

          {stage === 'form' && (
            <>
              <div className="mb-6 text-center">
                <h1 className="text-2xl font-black">Definir senha</h1>
                <p className="mt-2 text-sm text-slate-400">
                  Você foi convidado. Escolha uma senha para acessar sua conta.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <Lock size={12} />
                    Nova senha
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Mínimo 6 caracteres"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm outline-none transition-colors focus:border-cyan-300/60"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <Lock size={12} />
                    Confirmar senha
                  </span>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    placeholder="Repita a senha"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm outline-none transition-colors focus:border-cyan-300/60"
                  />
                </label>

                {errorMsg && (
                  <div className="flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    <AlertCircle size={13} />
                    {errorMsg}
                  </div>
                )}

                <button
                  disabled={submitting}
                  className="h-12 w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 text-sm font-black text-white shadow-[0_0_30px_rgba(0,212,255,0.22)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {submitting ? 'Salvando...' : 'Definir senha e entrar'}
                </button>
              </form>
            </>
          )}

          {stage === 'success' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle size={40} className="text-cyan-400" />
              <p className="text-center font-bold">Senha definida! Redirecionando...</p>
            </div>
          )}

          {stage === 'error' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <AlertCircle size={40} className="text-red-400" />
              <p className="font-bold text-red-300">{errorMsg}</p>
              <a href="/login" className="text-sm text-cyan-400 hover:underline">
                Ir para o login
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
