'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  LayoutDashboard,
  ArrowRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Projeto } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

export default function ProjectsPage() {
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [loading, setLoading] = useState(true)

  const [showCreate, setShowCreate] = useState(false)
  const [createNome, setCreateNome] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [creating, setCreating] = useState(false)

  const [editProjeto, setEditProjeto] = useState<Projeto | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchProjetos = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('projetos')
      .select('*')
      .order('data_criacao', { ascending: false })
    setProjetos((data ?? []) as Projeto[])
    setLoading(false)
  }

  useEffect(() => { fetchProjetos() }, [])

  const handleCreate = async () => {
    if (!createNome.trim()) return
    setCreating(true)
    await supabase.from('projetos').insert({
      nome: createNome.trim(),
      descricao: createDesc.trim() || null,
    })
    setCreating(false)
    setShowCreate(false)
    setCreateNome('')
    setCreateDesc('')
    fetchProjetos()
  }

  const openEdit = (p: Projeto) => {
    setEditProjeto(p)
    setEditNome(p.nome)
    setEditDesc(p.descricao ?? '')
  }

  const handleEdit = async () => {
    if (!editProjeto || !editNome.trim()) return
    setSaving(true)
    await supabase
      .from('projetos')
      .update({ nome: editNome.trim(), descricao: editDesc.trim() || null })
      .eq('id', editProjeto.id)
    setSaving(false)
    setEditProjeto(null)
    fetchProjetos()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    await supabase
      .from('projeto_produtos')
      .delete()
      .eq('projeto_id', deleteId)
    await supabase.from('projetos').delete().eq('id', deleteId)
    setDeleting(false)
    setDeleteId(null)
    fetchProjetos()
  }

  return (
    <div className="min-h-screen" style={{ background: '#0b0b14' }}>
      {/* Header */}
      <header
        className="border-b"
        style={{
          borderColor: 'rgba(255,255,255,0.07)',
          background: 'rgba(11,11,20,0.95)',
        }}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
              <LayoutDashboard size={16} className="text-indigo-400" />
            </div>
            <span className="text-sm font-bold text-slate-100">
              Hotmart Dashboard
            </span>
          </div>
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus size={14} />
            Novo Projeto
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-100">Projetos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gerencie seus projetos e visualize dados de vendas Hotmart
          </p>
        </div>

        {loading ? (
          <div className="flex h-52 items-center justify-center">
            <Spinner size={28} />
          </div>
        ) : projetos.length === 0 ? (
          <div
            className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed text-center"
            style={{ borderColor: 'rgba(255,255,255,0.12)' }}
          >
            <FolderOpen size={40} className="mb-3 text-slate-700" />
            <p className="text-sm font-medium text-slate-500">
              Nenhum projeto criado
            </p>
            <p className="mt-1 text-xs text-slate-700">
              Clique em &ldquo;Novo Projeto&rdquo; para começar
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/20 px-4 py-2 text-sm font-medium text-indigo-400 transition-colors hover:bg-indigo-500/30"
            >
              <Plus size={14} />
              Criar primeiro projeto
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projetos.map(p => (
              <ProjectCard
                key={p.id}
                projeto={p}
                onEdit={() => openEdit(p)}
                onDelete={() => setDeleteId(p.id)}
              />
            ))}
            <button
              onClick={() => setShowCreate(true)}
              className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-slate-600 transition-all hover:border-indigo-500/40 hover:text-indigo-400"
              style={{ borderColor: 'rgba(255,255,255,0.1)' }}
            >
              <Plus size={24} />
              <span className="text-sm font-medium">Novo Projeto</span>
            </button>
          </div>
        )}
      </main>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false)
          setCreateNome('')
          setCreateDesc('')
        }}
        title="Novo Projeto"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Nome *
            </label>
            <input
              autoFocus
              type="text"
              placeholder="Ex: Produto Principal"
              value={createNome}
              onChange={e => setCreateNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
              style={{ background: '#111120' }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Descrição
            </label>
            <textarea
              placeholder="Descrição opcional..."
              value={createDesc}
              onChange={e => setCreateDesc(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
              style={{ background: '#111120' }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => {
                setShowCreate(false)
                setCreateNome('')
                setCreateDesc('')
              }}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleCreate}
              disabled={!createNome.trim() || creating}
            >
              {creating && <Spinner size={14} />}
              Criar Projeto
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={!!editProjeto}
        onClose={() => setEditProjeto(null)}
        title="Editar Projeto"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Nome *
            </label>
            <input
              autoFocus
              type="text"
              value={editNome}
              onChange={e => setEditNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEdit()}
              className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
              style={{ background: '#111120' }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Descrição
            </label>
            <textarea
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
              style={{ background: '#111120' }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setEditProjeto(null)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={handleEdit}
              disabled={!editNome.trim() || saving}
            >
              {saving && <Spinner size={14} />}
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Excluir Projeto"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Tem certeza que deseja excluir este projeto? Os dados de vendas e
            produtos não serão afetados.
          </p>
          <div className="flex gap-2 pt-1">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setDeleteId(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Spinner size={14} />}
              Excluir
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function ProjectCard({
  projeto,
  onEdit,
  onDelete,
}: {
  projeto: Projeto
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="group relative rounded-2xl border p-5 transition-all duration-200"
      style={{
        background: '#191929',
        borderColor: 'rgba(255,255,255,0.07)',
      }}
    >
      {/* Action buttons */}
      <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onEdit}
          title="Editar"
          className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white/10 hover:text-slate-300"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={onDelete}
          title="Excluir"
          className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-red-500/15 hover:text-red-400"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Icon */}
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15">
        <LayoutDashboard size={18} className="text-indigo-400" />
      </div>

      {/* Info */}
      <h3 className="text-sm font-semibold text-slate-100">{projeto.nome}</h3>
      {projeto.descricao && (
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
          {projeto.descricao}
        </p>
      )}

      {/* Open button */}
      <Link
        href={`/dashboard/${projeto.id}`}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-slate-500 transition-all hover:bg-indigo-500/12 hover:text-indigo-400"
        style={{ background: 'rgba(255,255,255,0.04)' }}
      >
        Abrir Dashboard
        <ArrowRight size={12} />
      </Link>
    </div>
  )
}
