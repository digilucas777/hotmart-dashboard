'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutDashboard, Mail, Lock, LogIn, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setLoading(false)
    if (authError) {
      setError('E-mail ou senha incorretos.')
      return
    }
    router.push('/')
    router.refresh()
  }

  const handleGoogleLogin = async () => {
    setError('')
    setGoogleLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
      },
    })
    // signInWithOAuth redirects the browser — code below only runs on error
    setGoogleLoading(false)
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: '#0b0b14' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20">
            <LayoutDashboard size={22} className="text-indigo-400" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-slate-100">Hotmart Dashboard</h1>
            <p className="mt-0.5 text-sm text-slate-500">Faça login para continuar</p>
          </div>
        </div>

        {/* Card */}
        <div
          className="space-y-4 rounded-2xl border p-6"
          style={{ background: '#191929', borderColor: 'rgba(255,255,255,0.07)' }}
        >
          {/* E-mail + senha */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Mail size={11} />
                E-mail
              </label>
              <input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
                style={{ background: '#111120' }}
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Lock size={11} />
                Senha
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
                style={{ background: '#111120' }}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
                <AlertCircle size={12} className="flex-shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading || googleLoading} className="w-full" size="md">
              {loading ? <Spinner size={14} /> : <LogIn size={14} />}
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          {/* Separador */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <span className="text-xs text-slate-600">ou</span>
            <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: '#111120', borderColor: 'rgba(255,255,255,0.12)' }}
          >
            {googleLoading ? <Spinner size={14} /> : <GoogleIcon />}
            Entrar com Google
          </button>
        </div>
      </div>
    </div>
  )
}
