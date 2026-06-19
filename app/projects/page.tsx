'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  LayoutDashboard,
  ArrowRight,
  GripVertical,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import type { Projeto } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

export default function ProjectsPage() {
  const router = useRouter()
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [allowedProjetoIds, setAllowedProjetoIds] = useState<Set<string> | null>(null)

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const fetchProjetos = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('projetos')
      .select('*')
      .order('ordem', { ascending: true })
      .order('data_criacao', { ascending: false })
    setProjetos((data ?? []) as Projeto[])
    setLoading(false)
  }

  useEffect(() => { fetchProjetos() }, [])

  useEffect(() => {
    async function loadUserPerms() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      const role = (profile as { role?: string } | null)?.role ?? 'user'
      console.log('[PROJECTS] profile:', profile, '| role:', role)
      setUserRole(role)
      if (role === 'admin') return
      const { data: perms } = await supabase
        .from('user_dashboard_permissions')
        .select('projeto_id')
        .eq('user_id', user.id)
        .eq('pode_visualizar', true)
      setAllowedProjetoIds(new Set(((perms ?? []) as { projeto_id: string }[]).map(p => p.projeto_id)))
    }
    void loadUserPerms()
  }, [router])

  const handleCreate = async () => {
    if (!createNome.trim()) return
    setCreating(true)
    await supabase.from('projetos').insert({
      nome: createNome.trim(),
      descricao: createDesc.trim() || null,
      ordem: projetos.length,
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
    await supabase.from('projeto_produtos').delete().eq('projeto_id', deleteId)
    await supabase.from('projetos').delete().eq('id', deleteId)
    setDeleting(false)
    setDeleteId(null)
    fetchProjetos()
  }

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = projetos.findIndex(p => p.id === active.id)
    const newIndex = projetos.findIndex(p => p.id === over.id)
    const reordered = arrayMove(projetos, oldIndex, newIndex)
    setProjetos(reordered)
    await Promise.all(
      reordered.map((p, i) =>
        supabase.from('projetos').update({ ordem: i }).eq('id', p.id),
      ),
    )
  }, [projetos])

  const isAdmin = userRole === 'admin'
  const visibleProjetos = isAdmin || allowedProjetoIds === null
    ? projetos
    : projetos.filter(p => allowedProjetoIds.has(p.id))

  return (
    <div className="min-h-screen" style={{ background: '#0b0b14' }}>
      <header
        className="border-b"
        style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(11,11,20,0.95)' }}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
              <LayoutDashboard size={16} className="text-indigo-400" />
            </div>
            <span className="text-sm font-bold text-slate-100">Hotmart Dashboard</span>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreate(true)} size="sm">
              <Plus size={14} />
              Novo Projeto
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-100">Projetos</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Arraste para reordenar. Clique para abrir o dashboard.
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
            <p className="text-sm font-medium text-slate-500">Nenhum projeto criado</p>
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={isAdmin ? handleDragEnd : () => {}}>
            <SortableContext items={visibleProjetos.map(p => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {visibleProjetos.map(p => (
                  <SortableProjectCard
                    key={p.id}
                    projeto={p}
                    onEdit={isAdmin ? () => openEdit(p) : undefined}
                    onDelete={isAdmin ? () => setDeleteId(p.id) : undefined}
                  />
                ))}
                {isAdmin && (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed text-slate-600 transition-all hover:border-indigo-500/40 hover:text-indigo-400"
                    style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                  >
                    <Plus size={20} />
                    <span className="text-xs font-medium">Novo Projeto</span>
                  </button>
                )}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </main>

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); setCreateNome(''); setCreateDesc('') }}
        title="Novo Projeto"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Nome *</label>
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
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Descrição</label>
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
            <Button variant="ghost" className="flex-1" onClick={() => { setShowCreate(false); setCreateNome(''); setCreateDesc('') }}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleCreate} disabled={!createNome.trim() || creating}>
              {creating && <Spinner size={14} />}
              Criar Projeto
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editProjeto} onClose={() => setEditProjeto(null)} title="Editar Projeto">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Nome *</label>
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
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Descrição</label>
            <textarea
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
              style={{ background: '#111120' }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={() => setEditProjeto(null)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleEdit} disabled={!editNome.trim() || saving}>
              {saving && <Spinner size={14} />}
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Excluir Projeto">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Tem certeza que deseja excluir este projeto? Os dados de vendas e produtos não serão afetados.
          </p>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="danger" className="flex-1" onClick={handleDelete} disabled={deleting}>
              {deleting && <Spinner size={14} />}
              Excluir
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function SortableProjectCard({
  projeto,
  onEdit,
  onDelete,
}: {
  projeto: Projeto
  onEdit?: () => void
  onDelete?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: projeto.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        zIndex: isDragging ? 50 : undefined,
        background: '#191929',
        borderColor: 'rgba(255,255,255,0.07)',
      }}
      className="group relative rounded-xl border p-3.5 transition-colors duration-150"
    >

      {/* Drag handle — admin only */}
      {onEdit && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-2 top-2 cursor-grab touch-none p-1 text-slate-500 active:cursor-grabbing"
          title="Arrastar para reordenar"
        >
          <GripVertical size={13} />
        </div>
      )}

      {/* Action buttons */}
      {(onEdit || onDelete) && (
        <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {onEdit && (
            <button
              onClick={onEdit}
              title="Editar"
              className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white/10 hover:text-slate-300"
            >
              <Pencil size={11} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              title="Excluir"
              className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-red-500/15 hover:text-red-400"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      )}

      {/* Icon */}
      <div className="mb-3 mt-1 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15">
        <LayoutDashboard size={15} className="text-indigo-400" />
      </div>

      {/* Info */}
      <h3 className="text-xs font-semibold text-slate-100">{projeto.nome}</h3>
      {projeto.descricao && (
        <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{projeto.descricao}</p>
      )}

      {/* Open button */}
      <Link
        href={`/dashboard/${projeto.id}`}
        className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium text-slate-500 transition-all hover:bg-indigo-500/12 hover:text-indigo-400"
        style={{ background: 'rgba(255,255,255,0.04)' }}
      >
        Abrir Dashboard
        <ArrowRight size={11} />
      </Link>
    </div>
  )
}
