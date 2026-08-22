'use client'

import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { DashboardCombo, Projeto } from '@/lib/types'

export function CombineDashboardsModal({
  open,
  onClose,
  projetos,
  userId,
  combo,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  projetos: Projeto[]
  userId: string
  combo: DashboardCombo | null
  onSaved: (combo: DashboardCombo) => void
}) {
  const [nome, setNome] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setNome(combo?.nome ?? '')
    setSelectedIds(combo?.projeto_ids ?? [])
    setError('')
  }, [open, combo])

  if (!open) return null

  function toggle(id: string) {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  async function save() {
    if (!nome.trim() || selectedIds.length === 0) return
    setSaving(true)
    setError('')

    if (combo) {
      const { data, error: updateError } = await supabase
        .from('dashboard_combos')
        .update({ nome: nome.trim(), projeto_ids: selectedIds })
        .eq('id', combo.id)
        .select()
        .single()
      setSaving(false)
      if (updateError || !data) { setError('Não foi possível salvar as alterações.'); return }
      onSaved(data as DashboardCombo)
      return
    }

    const { data, error: insertError } = await supabase
      .from('dashboard_combos')
      .insert({ nome: nome.trim(), projeto_ids: selectedIds, user_id: userId })
      .select()
      .single()
    setSaving(false)
    if (insertError || !data) { setError('Não foi possível criar a combinação.'); return }
    onSaved(data as DashboardCombo)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#0b0d14] p-6 shadow-2xl shadow-black/50">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
              {combo ? 'Editar combinação' : 'Nova combinação'}
            </p>
            <h2 className="mt-1 text-xl font-black">Combinar dashboards</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-slate-400 hover:text-white">
            <X size={17} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-500">Nome da combinação</span>
          <input
            autoFocus
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Ex: Europa"
            className="h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition-colors placeholder:text-slate-700 focus:border-cyan-300/60"
          />
        </label>

        <div className="mt-4">
          <span className="mb-1.5 block text-xs font-semibold text-slate-500">Projetos ({selectedIds.length} selecionados)</span>
          <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-2xl border border-white/10 bg-black/25 p-3">
            {projetos.length === 0 && (
              <p className="px-2 py-3 text-sm text-slate-500">Nenhum dashboard disponível.</p>
            )}
            {projetos.map(p => (
              <label key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-white/[0.04]">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(p.id)}
                  onChange={() => toggle(p.id)}
                  className="h-4 w-4 rounded border-white/20 bg-black/40 accent-cyan-400"
                />
                <span className="font-semibold text-slate-200">{p.nome}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-2xl border border-white/10 text-sm font-black text-slate-300 transition-colors hover:text-white">
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!nome.trim() || selectedIds.length === 0 || saving}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 text-sm font-black text-white disabled:opacity-50"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {combo ? 'Salvar' : 'Criar combinação'}
          </button>
        </div>
      </div>
    </div>
  )
}
