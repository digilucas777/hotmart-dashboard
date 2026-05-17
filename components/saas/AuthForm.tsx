'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, Lock, Mail, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DashSpeedLogo } from './DashSpeedLogo'

type AuthMode = 'login' | 'register' | 'forgot'

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function MetaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.8 16.8c1.1 0 2.1-1.1 3.4-3.2l.9-1.5.9 1.4c1.5 2.4 2.7 3.3 4 3.3 2.2 0 3.8-1.9 3.8-4.8 0-2.9-1.6-4.8-3.8-4.8-1.6 0-2.9 1-4 2.8l-.9 1.4-.8-1.3C7.2 8.2 6 7.2 4.5 7.2 2.2 7.2.6 9.2.6 12.1c0 2.8 1.7 4.7 4.2 4.7Zm-.1-2.1c-1.1 0-1.9-1-1.9-2.7 0-1.6.7-2.7 1.8-2.7.8 0 1.5.6 2.4 2l.8 1.2-1 1.5c-.8 1.2-1.4 1.7-2.1 1.7Zm9.2 0c-.8 0-1.6-.6-2.6-2.1l-.9-1.4.8-1.2c.9-1.3 1.7-1.9 2.6-1.9 1.1 0 1.9 1.1 1.9 2.8 0 1.7-.7 2.8-1.8 2.8Z"
        fill="#60a5fa"
      />
    </svg>
  )
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const isLogin = mode === 'login'
  const isRegister = mode === 'register'
  const isForgot = mode === 'forgot'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    if (isLogin) {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (authError) {
        setError('E-mail ou senha incorretos.')
        return
      }
      router.push('/dashboard')
      router.refresh()
      return
    }

    if (isRegister) {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      })
      setLoading(false)
      if (authError) {
        setError(authError.message)
        return
      }
      setMessage('Cadastro criado. Confira seu e-mail para confirmar o acesso.')
      return
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    setLoading(false)
    if (resetError) {
      setError(resetError.message)
      return
    }
    setMessage('Enviamos as instruções de recuperação para seu e-mail.')
  }

  async function oauth(provider: 'google' | 'facebook') {
    setError('')
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        scopes: provider === 'facebook' ? 'email,public_profile,ads_read,business_management' : undefined,
      },
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07080d] px-4 py-16 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(0,212,255,0.14),transparent_34rem),radial-gradient(circle_at_88%_12%,rgba(167,139,250,0.14),transparent_30rem)]" />
      <div className="relative w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center">
          <DashSpeedLogo />
        </Link>
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/40 backdrop-blur-2xl">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-black">
              {isLogin ? 'Entrar no Dash Speed' : isRegister ? 'Criar sua conta' : 'Recuperar senha'}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {isLogin
                ? 'Acesse seus dashboards e relatórios inteligentes.'
                : isRegister
                  ? 'Comece a organizar seus dados em poucos minutos.'
                  : 'Informe seu e-mail para receber as instruções.'}
            </p>
          </div>

          {!isForgot && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button onClick={() => oauth('google')} className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10">
                <GoogleIcon />
                Google
              </button>
              <button onClick={() => oauth('facebook')} className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10">
                <MetaIcon />
                Meta
              </button>
            </div>
          )}

          {!isForgot && (
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-slate-500">ou</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <UserRound size={12} />
                  Nome
                </span>
                <input value={name} onChange={e => setName(e.target.value)} required className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm outline-none transition-colors focus:border-cyan-300/60" />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <Mail size={12} />
                E-mail
              </span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm outline-none transition-colors focus:border-cyan-300/60" />
            </label>
            {!isForgot && (
              <label className="block">
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <Lock size={12} />
                  Senha
                </span>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm outline-none transition-colors focus:border-cyan-300/60" />
              </label>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                <AlertCircle size={13} />
                {error}
              </div>
            )}
            {message && <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-100">{message}</div>}

            <button disabled={loading} className="h-12 w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 text-sm font-black text-white shadow-[0_0_30px_rgba(0,212,255,0.22)] transition-transform hover:-translate-y-0.5 disabled:opacity-60">
              {loading ? 'Aguarde...' : isLogin ? 'Entrar' : isRegister ? 'Criar conta' : 'Enviar recuperação'}
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-500">
            {isLogin && <Link href="/forgot-password" className="hover:text-white">Esqueci minha senha</Link>}
            {isLogin ? (
              <Link href="/register" className="font-semibold text-cyan-200 hover:text-white">Criar conta</Link>
            ) : (
              <Link href="/login" className="font-semibold text-cyan-200 hover:text-white">Voltar ao login</Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
