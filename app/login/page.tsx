'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutDashboard, Mail, Lock, LogIn, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
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
        <form
          onSubmit={handleLogin}
          className="space-y-4 rounded-2xl border p-6"
          style={{ background: '#191929', borderColor: 'rgba(255,255,255,0.07)' }}
        >
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

          <Button type="submit" disabled={loading} className="w-full" size="md">
            {loading ? <Spinner size={14} /> : <LogIn size={14} />}
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  )
}
