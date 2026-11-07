'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Target, Plus, Pencil, Trash2, HelpCircle, AlertTriangle, Copy, Check, ChevronDown, Code2, Globe, Rocket } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { InstallationModal } from './_components/InstallationModal'
import { HelpGuideModal } from './_components/HelpGuideModal'
import { TrackDashboard } from './_components/TrackDashboard'
import { ScriptModal } from './_components/ScriptModal'
import type { TrackInstallation } from '@/lib/track/types'

export default function RastreamentoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [installations, setInstallations] = useState<TrackInstallation[]>([])
  const [showHelp, setShowHelp] = useState(false)
  const [editing, setEditing] = useState<TrackInstallation | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<TrackInstallation | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [savedPopup, setSavedPopup] = useState<TrackInstallation | null>(null)
  const [deployToast, setDeployToast] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try { return typeof window === 'undefined' ? null : localStorage.getItem('rastreamento:instalacao') } catch { return null }
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [scriptFor, setScriptFor] = useState<TrackInstallation | null>(null)

  // Instalação escolhida no topo: a última vista (guardada no navegador) ou a
  // primeira publicada.
  const selected = useMemo(() => {
    if (installations.length === 0) return null
    return installations.find(i => i.id === selectedId)
      ?? installations.find(i => i.status === 'deployed')
      ?? installations[0]
  }, [installations, selectedId])

  function selectInstallation(id: string) {
    setSelectedId(id)
    setPickerOpen(false)
    try { localStorage.setItem('rastreamento:instalacao', id) } catch {}
  }

  const fetchInstallations = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/track/installations')
    const json = await res.json().catch(() => ({}))
    setInstallations(json?.installations ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('user_profiles').select('role, pode_gerenciar_rastreamento').eq('id', user.id).maybeSingle()
      const admin = profile?.role === 'admin' || profile?.pode_gerenciar_rastreamento === true
      setIsAdmin(admin)
      setCheckingAccess(false)
      if (admin) await fetchInstallations()
    }
    void init()
  }, [router, fetchInstallations])

  function openCreate() {
    setEditing(null)
    setShowModal(true)
  }
  function openEdit(installation: TrackInstallation) {
    setEditing(installation)
    setShowModal(true)
  }
  function handleSaved(installation: TrackInstallation) {
    setShowModal(false)
    void fetchInstallations()
    setSavedPopup(installation)
  }

  function handleDeployed() {
    setShowModal(false)
    void fetchInstallations()
    setDeployToast(true)
    setTimeout(() => setDeployToast(false), 4000)
  }

  async function handleCopyFromPopup(url: string) {
    await navigator.clipboard.writeText(url)
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    setDeleting(true)
    await fetch('/api/track/installations/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: confirmDelete.id }),
    })
    setDeleting(false)
    setConfirmDelete(null)
    void fetchInstallations()
  }

  async function handleCopyWebhook(installation: TrackInstallation) {
    if (!installation.webhook_url) return
    await navigator.clipboard.writeText(installation.webhook_url)
    setCopiedId(installation.id)
    setTimeout(() => setCopiedId(prev => (prev === installation.id ? null : prev)), 2000)
  }

  return (
    <div className="min-h-screen" style={{ background: '#0b0b14' }}>
      <header className="sticky top-0 z-30 border-b backdrop-blur" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(11,11,20,0.9)' }}>
        <div className="mx-auto flex min-h-14 max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
                <Target size={16} className="text-indigo-400" />
              </div>
              <span className="hidden text-sm font-bold text-slate-100 sm:inline">Rastreamento</span>
            </div>

            {isAdmin && selected && (
              <div className="relative min-w-0">
                <button
                  onClick={() => setPickerOpen(o => !o)}
                  className="flex min-w-0 max-w-[260px] items-center gap-2 rounded-xl px-3 py-1.5 text-left ring-1 ring-white/10 transition-colors hover:bg-white/5 sm:max-w-[340px]"
                  style={{ background: '#151524' }}
                  aria-haspopup="listbox"
                  aria-expanded={pickerOpen}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${selected.status === 'deployed' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-100">{selected.nome}</span>
                    {selected.worker_subdomain && <span className="block truncate text-[10.5px] text-slate-500">{selected.worker_subdomain}</span>}
                  </span>
                  <ChevronDown size={14} className={`shrink-0 text-slate-500 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
                </button>
                {pickerOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
                    <div className="absolute left-0 top-full z-50 mt-2 w-[300px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border shadow-2xl" style={{ background: '#151524', borderColor: 'rgba(255,255,255,0.1)' }} role="listbox">
                      <p className="px-3 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-600">Instalações</p>
                      <div className="max-h-[320px] overflow-y-auto p-1">
                        {installations.map(inst => (
                          <button
                            key={inst.id}
                            onClick={() => selectInstallation(inst.id)}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/5 ${inst.id === selected.id ? 'bg-indigo-500/15' : ''}`}
                            role="option"
                            aria-selected={inst.id === selected.id}
                          >
                            <span className={`h-2 w-2 shrink-0 rounded-full ${inst.status === 'deployed' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold text-slate-200">{inst.nome}</span>
                              <span className="block truncate text-[10.5px] text-slate-500">{inst.status === 'deployed' ? (inst.worker_subdomain ?? 'Publicado') : 'Rascunho'}</span>
                            </span>
                            {inst.id === selected.id && <Check size={13} className="shrink-0 text-indigo-300" />}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => { setPickerOpen(false); openCreate() }} className="flex w-full items-center gap-2 border-t px-3 py-2.5 text-xs font-semibold text-indigo-300 hover:bg-white/5" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                        <Plus size={13} /> Nova instalação
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => setShowHelp(true)} size="sm" variant="outline">
              <HelpCircle size={14} />
              <span className="hidden sm:inline">Como configurar</span>
            </Button>
            <Button onClick={openCreate} size="sm">
              <Plus size={14} />
              <span className="hidden sm:inline">Nova instalação</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        {checkingAccess ? (
          <div className="flex justify-center py-16"><Spinner size={24} /></div>
        ) : !isAdmin ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-20 text-center" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <span className="text-3xl">🚧</span>
            <h1 className="mt-2 text-lg font-bold text-slate-100">Em teste</h1>
            <p className="max-w-sm text-sm text-slate-500">
              Esse módulo de rastreamento ainda está em teste. Em breve disponível pra todo mundo.
            </p>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-16"><Spinner size={24} /></div>
        ) : !selected ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-16 text-center" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <Target size={28} className="text-slate-700" />
            <p className="text-sm text-slate-400">Nenhuma instalação cadastrada ainda.</p>
            <p className="max-w-sm text-xs text-slate-600">Cadastre o pixel, o webhook de compra e publique o robô na sua conta Cloudflare com um clique.</p>
            <Button size="sm" className="mt-2" onClick={openCreate}>
              <Plus size={14} />
              Criar primeira instalação
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* ---------- instalação escolhida ---------- */}
            <div className="rounded-2xl border p-4 sm:p-5" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(21,21,36,1) 45%)', borderColor: 'rgba(255,255,255,0.07)' }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-lg font-bold text-slate-50">{selected.nome}</h1>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${selected.status === 'deployed' ? 'text-emerald-300' : 'text-slate-400'}`}
                      style={{ background: selected.status === 'deployed' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)' }}
                    >
                      {selected.status === 'deployed' ? 'Publicado' : 'Rascunho'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {selected.domains.filter(d => d.tipo === 'lp').map(d => (
                      <span key={d.domain} className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-slate-400" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <Globe size={11} className="text-slate-500" />{d.domain}
                      </span>
                    ))}
                    <span className="text-[11px] text-slate-600">
                      {selected.pixels.length} pixel{selected.pixels.length !== 1 ? 's' : ''} · {selected.triggers.length} gatilho{selected.triggers.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {selected.status === 'deployed' && selected.worker_subdomain && (
                    <button onClick={() => setScriptFor(selected)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 ring-1 ring-white/10 hover:bg-white/5">
                      <Code2 size={13} /> Script
                    </button>
                  )}
                  {selected.webhook_url && (
                    <button onClick={() => void handleCopyWebhook(selected)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 ring-1 ring-white/10 hover:bg-white/5">
                      {copiedId === selected.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                      {copiedId === selected.id ? 'Copiado' : 'Webhook'}
                    </button>
                  )}
                  <button onClick={() => openEdit(selected)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 ring-1 ring-white/10 hover:bg-white/5">
                    <Pencil size={13} /> Editar
                  </button>
                  <button onClick={() => setConfirmDelete(selected)} className="rounded-lg p-1.5 text-slate-500 ring-1 ring-white/10 hover:bg-rose-500/15 hover:text-rose-400" title="Excluir instalação" aria-label="Excluir instalação">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>

            {selected.status === 'deployed' ? (
              <TrackDashboard key={selected.id} installationId={selected.id} triggers={selected.triggers} />
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-14 text-center" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                <Rocket size={28} className="text-indigo-400" />
                <p className="text-sm font-semibold text-slate-200">Essa instalação ainda não foi publicada</p>
                <p className="max-w-sm text-xs text-slate-500">Termine o cadastro e clique em &quot;Fazer deploy&quot;. Assim que o robô estiver no ar, as visitas e vendas aparecem aqui.</p>
                <Button size="sm" onClick={() => openEdit(selected)}>
                  <Pencil size={14} />
                  Continuar configuração
                </Button>
              </div>
            )}
          </div>
        )}
      </main>

      {isAdmin && (
      <>
      <InstallationModal
        open={showModal}
        installation={editing}
        onClose={() => setShowModal(false)}
        onSaved={handleSaved}
        onDeployed={handleDeployed}
      />
      <HelpGuideModal open={showHelp} onClose={() => setShowHelp(false)} />
      <ScriptModal installation={scriptFor} onClose={() => setScriptFor(null)} />

      <Modal open={!!savedPopup} onClose={() => setSavedPopup(null)} title="Instalação salva">
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            <span className="font-semibold">&quot;{savedPopup?.nome}&quot;</span> foi salva com sucesso.
          </p>
          {savedPopup?.webhook_url ? (
            <div className="rounded-xl p-3 ring-1 ring-white/10" style={{ background: '#111120' }}>
              <p className="mb-1.5 text-xs font-medium text-slate-500">URL do webhook (cole na Hotmart)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs text-cyan-300">{savedPopup.webhook_url}</code>
                <button
                  onClick={() => savedPopup?.webhook_url && handleCopyFromPopup(savedPopup.webhook_url)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                  title="Copiar"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-600">Defina o subdomínio do Worker (seção 2) pra gerar a URL do webhook.</p>
          )}
          <Button className="w-full" onClick={() => setSavedPopup(null)}>Entendi</Button>
        </div>
      </Modal>

      {deployToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/15 px-4 py-3 text-sm text-green-300 shadow-xl">
          <Check size={16} />
          Worker publicado com sucesso!
        </div>
      )}

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Confirmar exclusão">
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-400" />
            <p className="text-sm text-slate-200">
              Tem certeza que quer excluir a instalação <span className="font-semibold">&quot;{confirmDelete?.nome}&quot;</span>?
              Todos os pixels, domínios e gatilhos cadastrados nela também serão excluídos. Essa ação não pode ser desfeita.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button variant="danger" className="flex-1" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting && <Spinner size={14} />}
              Excluir
            </Button>
          </div>
        </div>
      </Modal>
      </>
      )}
    </div>
  )
}
