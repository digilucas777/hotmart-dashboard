'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Target, Plus, Pencil, Trash2, HelpCircle, AlertTriangle, Copy, Check, BarChart3, ChevronDown, ChevronRight, ScanSearch, Code2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { InstallationModal } from './_components/InstallationModal'
import { HelpGuideModal } from './_components/HelpGuideModal'
import { EventsPanel } from './_components/EventsPanel'
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
  const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null)
  const [scriptCheck, setScriptCheck] = useState<Record<string, { loading: boolean; error?: string; results?: { domain: string; found: boolean; error?: string }[] }>>({})
  const [scriptCheckUrl, setScriptCheckUrl] = useState<Record<string, string>>({})
  const [savedPopup, setSavedPopup] = useState<TrackInstallation | null>(null)
  const [deployToast, setDeployToast] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [expandedEvents, setExpandedEvents] = useState<string | null>(null)
  const [expandedScript, setExpandedScript] = useState<string | null>(null)

  function toggleEvents(id: string) {
    setExpandedEvents(prev => (prev === id ? null : id))
  }
  function toggleScript(id: string) {
    setExpandedScript(prev => (prev === id ? null : id))
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
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
      const admin = profile?.role === 'admin'
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

  async function handleCopySnippet(installation: TrackInstallation) {
    if (!installation.worker_subdomain) return
    await navigator.clipboard.writeText(`<script src="https://${installation.worker_subdomain}/t.js"></script>`)
    setCopiedScriptId(installation.id)
    setTimeout(() => setCopiedScriptId(prev => (prev === installation.id ? null : prev)), 2000)
  }

  async function handleCheckScript(installation: TrackInstallation) {
    setScriptCheck(prev => ({ ...prev, [installation.id]: { loading: true } }))
    const url = (scriptCheckUrl[installation.id] ?? '').trim()
    const res = await fetch('/api/track/installations/check-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: installation.id, url: url || undefined }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setScriptCheck(prev => ({ ...prev, [installation.id]: { loading: false, error: json?.error || 'Não foi possível verificar agora.' } }))
      return
    }
    setScriptCheck(prev => ({ ...prev, [installation.id]: { loading: false, results: json.results } }))
  }

  return (
    <div className="min-h-screen" style={{ background: '#0b0b14' }}>
      <header className="border-b" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(11,11,20,0.95)' }}>
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
              <Target size={16} className="text-indigo-400" />
            </div>
            <span className="text-sm font-bold text-slate-100">Rastreamento</span>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowHelp(true)} size="sm" variant="outline">
              <HelpCircle size={14} />
              Como configurar
            </Button>
            <Button onClick={openCreate} size="sm">
              <Plus size={14} />
              Nova instalação
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-8">
        {checkingAccess ? (
          <div className="flex justify-center py-16"><Spinner size={24} /></div>
        ) : !isAdmin ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-20 text-center" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <span className="text-3xl">🚧</span>
            <h1 className="mt-2 text-lg font-bold text-slate-100">Em teste</h1>
            <p className="max-w-sm text-sm text-slate-500">
              Esse módulo de rastreamento ainda está em teste — em breve disponível pra todo mundo.
            </p>
          </div>
        ) : (
        <>
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-100">Instalações de rastreamento</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Cadastre aqui os dados do Meta Pixel + CAPI e do webhook de compra, e publique o Worker
            direto na sua conta Cloudflare com um clique em &quot;Fazer deploy&quot;.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size={24} /></div>
        ) : installations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-16 text-center" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <Target size={28} className="text-slate-700" />
            <p className="text-sm text-slate-500">Nenhuma instalação cadastrada ainda.</p>
            <Button size="sm" className="mt-2" onClick={openCreate}>
              <Plus size={14} />
              Criar primeira instalação
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {installations.map(inst => (
              <div key={inst.id} className="rounded-xl border p-4" style={{ background: '#191929', borderColor: 'rgba(255,255,255,0.07)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-slate-100">{inst.nome}</h3>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${inst.status === 'deployed' ? 'text-green-300' : 'text-slate-400'}`}
                        style={{ background: inst.status === 'deployed' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)' }}
                      >
                        {inst.status === 'deployed' ? '🚀 Publicado' : 'Rascunho'}
                      </span>
                    </div>
                    {inst.worker_subdomain && <p className="truncate text-xs text-slate-500">{inst.worker_subdomain}</p>}
                    <p className="mt-1 text-[11px] text-slate-600">
                      {inst.pixels.length} pixel{inst.pixels.length !== 1 ? 's' : ''} · {inst.domains.filter(d => d.tipo === 'lp').length} domínio{inst.domains.filter(d => d.tipo === 'lp').length !== 1 ? 's' : ''} · {inst.triggers.length} gatilho{inst.triggers.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {inst.webhook_url && (
                      <button
                        onClick={() => handleCopyWebhook(inst)}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                        title={copiedId === inst.id ? 'Copiado!' : 'Copiar URL do webhook'}
                      >
                        {copiedId === inst.id ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(inst)}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                      title="Editar instalação"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(inst)}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-400"
                      title="Excluir instalação"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {inst.status === 'deployed' && (
                  <div className="mt-3 flex items-center gap-4 border-t pt-2.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    {inst.worker_subdomain && (
                      <button
                        onClick={() => toggleScript(inst.id)}
                        className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300"
                      >
                        {expandedScript === inst.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <Code2 size={12} />
                        Script &amp; verificação
                      </button>
                    )}
                    <button
                      onClick={() => toggleEvents(inst.id)}
                      className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300"
                    >
                      {expandedEvents === inst.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <BarChart3 size={12} />
                      Eventos
                    </button>
                  </div>
                )}

                {inst.status === 'deployed' && inst.worker_subdomain && expandedScript === inst.id && (
                  <div className="mt-3 space-y-2 rounded-lg p-2.5 ring-1 ring-white/10" style={{ background: '#111120' }}>
                    <p className="text-[10px] font-medium text-slate-500">Script pra colar na &lt;head&gt; da página</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 truncate text-[11px] text-cyan-300">
                        {`<script src="https://${inst.worker_subdomain}/t.js"></script>`}
                      </code>
                      <button
                        onClick={() => handleCopySnippet(inst)}
                        className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                        title={copiedScriptId === inst.id ? 'Copiado!' : 'Copiar'}
                      >
                        {copiedScriptId === inst.id ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                      </button>
                    </div>
                    <div className="flex gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/10 p-2 text-[10px] text-blue-200">
                      <span>ℹ️</span>
                      <p>Se já tem o pixel nativo da Meta na página, pode deixar — esse script carrega ele sozinho e funde tudo em 1 evento (nunca conta em dobro).</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={scriptCheckUrl[inst.id] ?? ''}
                        onChange={e => setScriptCheckUrl(prev => ({ ...prev, [inst.id]: e.target.value }))}
                        placeholder="Opcional: cole a URL de uma página específica pra checar só ela"
                        className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-slate-300 placeholder-slate-600 outline-none focus:border-indigo-500/50"
                      />
                      <button
                        onClick={() => void handleCheckScript(inst)}
                        disabled={scriptCheck[inst.id]?.loading}
                        className="flex shrink-0 items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 disabled:opacity-60"
                      >
                        {scriptCheck[inst.id]?.loading ? <Spinner size={11} /> : <ScanSearch size={12} />}
                        Verificar
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-600">
                      Sem URL, verifica a página inicial de cada domínio cadastrado. Com uma URL colada ali em cima, verifica só ela.
                    </p>
                    {scriptCheck[inst.id]?.error && (
                      <p className="text-[11px] text-red-300">{scriptCheck[inst.id]?.error}</p>
                    )}
                    {scriptCheck[inst.id]?.results && (
                      <div className="space-y-1 border-t border-white/5 pt-2">
                        {scriptCheck[inst.id]!.results!.map(r => (
                          <p key={r.domain} className={`text-[11px] ${r.found ? 'text-green-400' : 'text-amber-400'}`}>
                            {r.found ? '✅' : '⚠️'} {r.domain} — {r.found ? 'script encontrado' : r.error ? r.error : 'script não encontrado na página inicial'}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {inst.status === 'deployed' && expandedEvents === inst.id && (
                  <div className="mt-3">
                    <EventsPanel installationId={inst.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </>
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
