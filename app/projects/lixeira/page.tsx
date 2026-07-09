'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, LayoutDashboard, RotateCcw, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Projeto } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

const RETENTION_DAYS = 10

function diasRestantes(deletedAt: string): number {
  const excluidoEm = new Date(deletedAt).getTime()
  const expiraEm = excluidoEm + RETENTION_DAYS * 24 * 60 * 60 * 1000
  const restante = Math.ceil((expiraEm - Date.now()) / (24 * 60 * 60 * 1000))
  return Math.max(0, restante)
}

export default function LixeiraPage() {
  const router = useRouter()
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const fetchLixeira = useCallback(async (userId: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('projetos')
      .select('*')
      .eq('user_id', userId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
    setProjetos((data ?? []) as Projeto[])
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await fetchLixeira(user.id)
    }
    void init()
  }, [router, fetchLixeira])

  async function handleRestaurar(id: string) {
    setRestoringId(id)
    await supabase.from('projetos').update({ deleted_at: null }).eq('id', id)
    setProjetos(prev => prev.filter(p => p.id !== id))
    setRestoringId(null)
  }

  return (
    <div className="min-h-screen" style={{ background: '#0b0b14' }}>
      <header
        className="border-b"
        style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(11,11,20,0.95)' }}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-6">
          <Link
            href="/projects"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
          >
            <ArrowLeft size={14} />
            Projetos
          </Link>
          <span className="text-sm font-bold text-slate-100">Lixeira</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-100">Lixeira</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Dashboards excluídos ficam aqui por {RETENTION_DAYS} dias antes de serem apagados de vez.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size={24} /></div>
        ) : projetos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-16 text-center" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <Trash2 size={28} className="text-slate-700" />
            <p className="text-sm text-slate-500">Nenhum dashboard excluído no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projetos.map(p => {
              const restantes = p.deleted_at ? diasRestantes(p.deleted_at) : 0
              return (
                <div
                  key={p.id}
                  className="rounded-xl border p-3.5"
                  style={{ background: '#191929', borderColor: 'rgba(255,255,255,0.07)' }}
                >
                  <div className="mb-2 mt-1 flex h-16 w-full items-center justify-center rounded-lg bg-slate-500/10">
                    <LayoutDashboard size={24} className="text-slate-600" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-100">{p.nome}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Excluído em {p.deleted_at ? new Date(p.deleted_at).toLocaleDateString('pt-BR') : '—'}
                  </p>
                  <p className={`mt-0.5 text-xs font-medium ${restantes <= 2 ? 'text-red-400' : 'text-amber-400'}`}>
                    {restantes > 0 ? `Apaga de vez em ${restantes} dia${restantes === 1 ? '' : 's'}` : 'Será apagado em breve'}
                  </p>
                  <Button
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => handleRestaurar(p.id)}
                    disabled={restoringId === p.id}
                  >
                    {restoringId === p.id ? <Spinner size={14} /> : <RotateCcw size={13} />}
                    Restaurar
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
