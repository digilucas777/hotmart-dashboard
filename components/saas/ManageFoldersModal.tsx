'use client'

import { useState } from 'react'
import { Check, Folder, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Projeto } from '@/lib/types'
import type { DashboardFolder } from '@/lib/dashboard-folders'
import { createFolder, renameFolder, deleteFolder, setFolderProjetos } from '@/lib/dashboard-folders'

export function ManageFoldersModal({
  open,
  onClose,
  folders,
  folderProjetos,
  allProjetos,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  folders: DashboardFolder[]
  folderProjetos: Record<string, string[]>
  allProjetos: Projeto[]
  onChanged: () => Promise<void>
}) {
  const [newFolderName, setNewFolderName] = useState('')
  const [savingNew, setSavingNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null)
  const [savingAssign, setSavingAssign] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  if (!open) return null

  async function handleCreate() {
    if (savingNew) return
    const nome = newFolderName.trim()
    if (!nome) return
    setError(null)
    setSavingNew(true)
    try {
      await createFolder(nome, folders.length)
      setNewFolderName('')
    } catch (err) {
      console.error(err)
      setError('Não foi possível criar a pasta. Tente de novo.')
    } finally {
      setSavingNew(false)
      await onChanged()
    }
  }

  async function handleRename(id: string) {
    const nome = editingName.trim()
    if (!nome) { setEditingId(null); return }
    setError(null)
    try {
      await renameFolder(id, nome)
      setEditingId(null)
    } catch (err) {
      console.error(err)
      setError('Não foi possível renomear a pasta.')
    } finally {
      await onChanged()
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteFolder(id)
    } catch (err) {
      console.error(err)
      setError('Não foi possível excluir a pasta.')
    } finally {
      await onChanged()
    }
  }

  async function handleToggleProjeto(folderId: string, projetoId: string, checked: boolean) {
    setError(null)
    setSavingAssign(true)
    try {
      const current = folderProjetos[folderId] ?? []
      const next = checked ? [...current, projetoId] : current.filter(id => id !== projetoId)
      await setFolderProjetos(folderId, next)
    } catch (err) {
      console.error(err)
      setError('Não foi possível atualizar os projetos da pasta.')
    } finally {
      setSavingAssign(false)
      await onChanged()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-[#0b0d14] p-6 shadow-2xl shadow-black/60">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-cyan-200">
              <Folder size={19} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">Organização</p>
              <h2 className="mt-1 text-xl font-black">Gerenciar pastas</h2>
            </div>
          </div>
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 text-slate-400 hover:text-white">
            <X size={17} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={newFolderName}
            onChange={event => setNewFolderName(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void handleCreate() }}
            placeholder="Nome da nova pasta (ex: Pedro)"
            className="h-11 flex-1 rounded-2xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none placeholder:text-slate-700 focus:border-cyan-300/60"
          />
          <button
            onClick={() => void handleCreate()}
            disabled={savingNew || !newFolderName.trim()}
            className="flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 text-sm font-black text-white disabled:opacity-50"
          >
            {savingNew ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Criar
          </button>
        </div>

        <div className="mt-5 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {folders.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-500">Nenhuma pasta criada ainda.</p>
          )}
          {folders.map(folder => (
            <div key={folder.id} className="rounded-2xl border border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-2 px-4 py-3">
                {editingId === folder.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={event => setEditingName(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') void handleRename(folder.id) }}
                    className="h-9 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-cyan-300/60"
                  />
                ) : (
                  <button
                    onClick={() => setExpandedFolderId(prev => prev === folder.id ? null : folder.id)}
                    className="flex-1 truncate text-left text-sm font-bold text-white"
                  >
                    {folder.nome}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {(folderProjetos[folder.id] ?? []).length} projeto(s)
                    </span>
                  </button>
                )}
                {editingId === folder.id ? (
                  <button onClick={() => void handleRename(folder.id)} className="flex h-8 w-8 items-center justify-center rounded-xl text-emerald-300 hover:bg-emerald-400/10">
                    <Check size={15} />
                  </button>
                ) : (
                  <button onClick={() => { setEditingId(folder.id); setEditingName(folder.nome) }} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-white">
                    <Pencil size={13} />
                  </button>
                )}
                {confirmingDeleteId === folder.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { void handleDelete(folder.id); setConfirmingDeleteId(null) }}
                      className="flex h-8 items-center justify-center rounded-xl bg-red-500/20 px-2 text-xs font-bold text-red-300 hover:bg-red-500/30"
                    >
                      Confirmar?
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(null)}
                      className="flex h-8 items-center justify-center rounded-xl px-2 text-xs font-bold text-slate-400 hover:bg-white/5 hover:text-white"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmingDeleteId(folder.id)} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-red-500/10 hover:text-red-300">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              {expandedFolderId === folder.id && (
                <div className="space-y-1 border-t border-white/5 px-4 py-3">
                  {allProjetos.map(projeto => {
                    const checked = (folderProjetos[folder.id] ?? []).includes(projeto.id)
                    return (
                      <label key={projeto.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-slate-300 hover:bg-white/[0.03]">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={savingAssign}
                          onChange={event => void handleToggleProjeto(folder.id, projeto.id, event.target.checked)}
                          className="h-4 w-4 rounded border-white/20 bg-black/25 text-cyan-400"
                        />
                        <span className="truncate">{projeto.nome}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
