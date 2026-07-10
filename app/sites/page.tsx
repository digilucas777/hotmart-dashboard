'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Pause, Play, Radio, ExternalLink, ShieldCheck, Pencil, RefreshCw, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

type MonitoredPage = {
  id: string
  site_id: string
  url: string
  ativo: boolean
  ultimo_status: string | null
  ultimo_status_code: number | null
  ultimo_tempo_ms: number | null
  ultima_checagem_em: string | null
}

type MonitoredSite = {
  id: string
  user_id: string
  nome: string
  dominio: string | null
  pages: MonitoredPage[]
}

type ConfirmDelete = { kind: 'site' | 'page'; id: string; label: string }

const STATUS_INFO: Record<string, { emoji: string; label: string; cor: string }> = {
  ok: { emoji: '🟢', label: 'No ar', cor: 'text-green-400' },
  lento: { emoji: '🟡', label: 'Lento', cor: 'text-amber-400' },
  fora_do_ar: { emoji: '🔴', label: 'Fora do ar', cor: 'text-red-400' },
  erro_servidor: { emoji: '🔴', label: 'Erro de servidor', cor: 'text-red-400' },
  nao_encontrada: { emoji: '🔴', label: 'Não encontrada', cor: 'text-red-400' },
}

function statusInfo(page: MonitoredPage) {
  if (!page.ultima_checagem_em) return { emoji: '⚪', label: 'Nunca checado', cor: 'text-slate-500' }
  return STATUS_INFO[page.ultimo_status ?? ''] ?? { emoji: '⚪', label: page.ultimo_status ?? '—', cor: 'text-slate-500' }
}

function tempoRelativo(iso: string | null): string {
  if (!iso) return '—'
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'agora mesmo'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

// Aceita URLs completas ou caminhos soltos (separados por vírgula ou linha) que
// são combinados com o domínio do site, ex: domínio "cursosjoy.site" + entrada
// "pv-b, pv-white, pressel" vira 3 URLs: https://cursosjoy.site/pv-b, etc.
function buildPageUrls(input: string, dominio: string | null): string[] {
  const partes = input.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
  const base = (dominio ?? '').replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  const urls = partes
    .map(parte => {
      if (/^https?:\/\//i.test(parte)) return parte
      if (!base) return null
      const caminho = parte.replace(/^\/+/, '')
      return caminho ? `https://${base}/${caminho}` : `https://${base}`
    })
    .filter((v): v is string => !!v)
  return Array.from(new Set(urls))
}

export default function SitesPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [sites, setSites] = useState<MonitoredSite[]>([])
  const [allSites, setAllSites] = useState<(MonitoredSite & { dono_email?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [showAllAdmin, setShowAllAdmin] = useState(false)

  const [showCreateSite, setShowCreateSite] = useState(false)
  const [siteName, setSiteName] = useState('')
  const [siteDomain, setSiteDomain] = useState('')
  const [creating, setCreating] = useState(false)

  const [addPageSiteId, setAddPageSiteId] = useState<string | null>(null)
  const [pageUrl, setPageUrl] = useState('')
  const [addingPage, setAddingPage] = useState(false)

  const [editSite, setEditSite] = useState<MonitoredSite | null>(null)
  const [editName, setEditName] = useState('')
  const [editDomain, setEditDomain] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [checkingSiteId, setCheckingSiteId] = useState<string | null>(null)
  const [checkingAll, setCheckingAll] = useState(false)

  const fetchSites = useCallback(async (uid: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('monitored_sites')
      .select('*, monitored_pages(*)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    const mapped = ((data ?? []) as (MonitoredSite & { monitored_pages: MonitoredPage[] })[]).map(s => ({
      ...s,
      pages: s.monitored_pages ?? [],
    }))
    setSites(mapped)
    setLoading(false)
  }, [])

  const fetchAllSites = useCallback(async () => {
    const [{ data }, { data: profiles }] = await Promise.all([
      supabase.from('monitored_sites').select('*, monitored_pages(*)').order('created_at', { ascending: false }),
      supabase.from('user_profiles').select('id, email'),
    ])
    const emailById = new Map(((profiles ?? []) as { id: string; email: string | null }[]).map(p => [p.id, p.email]))
    const mapped = ((data ?? []) as (MonitoredSite & { monitored_pages: MonitoredPage[] })[]).map(s => ({
      ...s,
      pages: s.monitored_pages ?? [],
      dono_email: emailById.get(s.user_id) ?? s.user_id,
    }))
    setAllSites(mapped)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
      setIsAdmin(profile?.role === 'admin')
      await fetchSites(user.id)
    }
    void init()
  }, [router, fetchSites])

  useEffect(() => {
    if (showAllAdmin) void fetchAllSites()
  }, [showAllAdmin, fetchAllSites])

  async function handleCreateSite() {
    if (!siteName.trim() || !userId) return
    setCreating(true)
    await supabase.from('monitored_sites').insert({
      user_id: userId,
      nome: siteName.trim(),
      dominio: siteDomain.trim() || null,
    })
    setCreating(false)
    setShowCreateSite(false)
    setSiteName('')
    setSiteDomain('')
    void fetchSites(userId)
  }

  async function handleAddPage() {
    if (!pageUrl.trim() || !addPageSiteId || !userId) return
    const site = sites.find(s => s.id === addPageSiteId)
    const urls = buildPageUrls(pageUrl, site?.dominio ?? null)
    if (urls.length === 0) return
    setAddingPage(true)
    await supabase.from('monitored_pages').insert(urls.map(url => ({ site_id: addPageSiteId, url })))
    setAddingPage(false)
    setAddPageSiteId(null)
    setPageUrl('')
    void fetchSites(userId)
  }

  function openEditSite(site: MonitoredSite) {
    setEditSite(site)
    setEditName(site.nome)
    setEditDomain(site.dominio ?? '')
  }

  async function handleEditSite() {
    if (!editSite || !editName.trim() || !userId) return
    setSavingEdit(true)
    await supabase
      .from('monitored_sites')
      .update({ nome: editName.trim(), dominio: editDomain.trim() || null })
      .eq('id', editSite.id)
    setSavingEdit(false)
    setEditSite(null)
    void fetchSites(userId)
  }

  async function handleConfirmDelete() {
    if (!confirmDelete || !userId) return
    setDeleting(true)
    if (confirmDelete.kind === 'site') {
      await supabase.from('monitored_sites').delete().eq('id', confirmDelete.id)
    } else {
      await supabase.from('monitored_pages').delete().eq('id', confirmDelete.id)
    }
    setDeleting(false)
    setConfirmDelete(null)
    void fetchSites(userId)
  }

  async function handleTogglePage(page: MonitoredPage) {
    if (!userId) return
    await supabase.from('monitored_pages').update({ ativo: !page.ativo }).eq('id', page.id)
    void fetchSites(userId)
  }

  async function handleCheckNow(siteId: string) {
    if (!userId) return
    setCheckingSiteId(siteId)
    try {
      await fetch('/api/sites/check-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      })
    } finally {
      setCheckingSiteId(null)
      void fetchSites(userId)
    }
  }

  async function handleCheckAll() {
    if (!userId) return
    setCheckingAll(true)
    try {
      await fetch('/api/sites/check-now', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    } finally {
      setCheckingAll(false)
      void fetchSites(userId)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#0b0b14' }}>
      <header className="border-b" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(11,11,20,0.95)' }}>
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
              <Radio size={16} className="text-indigo-400" />
            </div>
            <span className="text-sm font-bold text-slate-100">Sites monitorados</span>
          </div>
          <div className="flex items-center gap-2">
            {sites.length > 0 && (
              <Button onClick={handleCheckAll} size="sm" variant="outline" disabled={checkingAll}>
                {checkingAll ? <Spinner size={14} /> : <RefreshCw size={14} />}
                Checar tudo agora
              </Button>
            )}
            <Button onClick={() => setShowCreateSite(true)} size="sm">
              <Plus size={14} />
              Novo site
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-100">Sites</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Suas páginas de anúncio são checadas automaticamente de hora em hora. Você recebe uma
            notificação push quando alguma cair, der erro ou ficar lenta (mais de 10s).
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size={24} /></div>
        ) : sites.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-16 text-center" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <Radio size={28} className="text-slate-700" />
            <p className="text-sm text-slate-500">Nenhum site cadastrado ainda.</p>
            <Button size="sm" className="mt-2" onClick={() => setShowCreateSite(true)}>
              <Plus size={14} />
              Cadastrar primeiro site
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {sites.map(site => (
              <div key={site.id} className="rounded-xl border p-4" style={{ background: '#191929', borderColor: 'rgba(255,255,255,0.07)' }}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">{site.nome}</h3>
                    {site.dominio && <p className="text-xs text-slate-500">{site.dominio}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCheckNow(site.id)}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                      title="Checar agora"
                      disabled={checkingSiteId === site.id}
                    >
                      {checkingSiteId === site.id ? <Spinner size={14} /> : <RefreshCw size={14} />}
                    </button>
                    <button
                      onClick={() => openEditSite(site)}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                      title="Editar site"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setAddPageSiteId(site.id)}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                      title="Adicionar página(s)"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ kind: 'site', id: site.id, label: site.nome })}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-400"
                      title="Excluir site"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {site.pages.length === 0 ? (
                  <p className="text-xs text-slate-600">Nenhuma página cadastrada nesse site ainda.</p>
                ) : (
                  <div className="space-y-1.5">
                    {site.pages.map(page => {
                      const info = statusInfo(page)
                      return (
                        <div
                          key={page.id}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 ${page.ativo ? '' : 'opacity-50'}`}
                          style={{ background: 'rgba(255,255,255,0.03)' }}
                        >
                          <span className="text-base">{page.ativo ? info.emoji : '⏸️'}</span>
                          <div className="min-w-0 flex-1">
                            <a href={page.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 truncate text-xs font-medium text-slate-200 hover:text-indigo-300">
                              {page.url}
                              <ExternalLink size={10} className="shrink-0" />
                            </a>
                            <p className={`text-[11px] ${page.ativo ? info.cor : 'text-slate-600'}`}>
                              {page.ativo ? info.label : 'Pausado'}
                              {page.ultimo_status_code ? ` · HTTP ${page.ultimo_status_code}` : ''}
                              {page.ultimo_tempo_ms ? ` · ${page.ultimo_tempo_ms}ms` : ''}
                              {' · checado '}{tempoRelativo(page.ultima_checagem_em)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleTogglePage(page)}
                            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                            title={page.ativo ? 'Pausar checagem' : 'Retomar checagem'}
                          >
                            {page.ativo ? <Pause size={12} /> : <Play size={12} />}
                          </button>
                          <button
                            onClick={() => setConfirmDelete({ kind: 'page', id: page.id, label: page.url })}
                            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-400"
                            title="Excluir página"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <div className="mt-10">
            <button
              onClick={() => setShowAllAdmin(v => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-300"
            >
              <ShieldCheck size={13} />
              {showAllAdmin ? 'Ocultar' : 'Ver'} sites de todos os usuários
            </button>
            {showAllAdmin && (
              <div className="mt-4 space-y-4">
                {allSites.map(site => (
                  <div key={site.id} className="rounded-xl border p-4" style={{ background: '#15151f', borderColor: 'rgba(255,255,255,0.06)' }}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      Dono: {site.dono_email}
                    </p>
                    <h3 className="text-sm font-bold text-slate-200">{site.nome}</h3>
                    <div className="mt-2 space-y-1.5">
                      {site.pages.map(page => {
                        const info = statusInfo(page)
                        return (
                          <div key={page.id} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <span>{info.emoji}</span>
                            <span className="truncate text-slate-400">{page.url}</span>
                            <span className={`ml-auto shrink-0 ${info.cor}`}>{info.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <Modal open={showCreateSite} onClose={() => setShowCreateSite(false)} title="Novo site">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Nome *</label>
            <input
              autoFocus
              type="text"
              placeholder="Ex: Cursos Joy"
              value={siteName}
              onChange={e => setSiteName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateSite()}
              className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
              style={{ background: '#111120' }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Domínio (opcional)</label>
            <input
              type="text"
              placeholder="cursosjoy.site"
              value={siteDomain}
              onChange={e => setSiteDomain(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
              style={{ background: '#111120' }}
            />
            <p className="mt-1 text-[11px] text-slate-600">
              Cadastrando o domínio, você pode adicionar várias páginas de uma vez só depois (ex: pv-b, pv-white, pressel).
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={() => setShowCreateSite(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleCreateSite} disabled={!siteName.trim() || creating}>
              {creating && <Spinner size={14} />}
              Criar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editSite} onClose={() => setEditSite(null)} title="Editar site">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Nome *</label>
            <input
              autoFocus
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEditSite()}
              className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
              style={{ background: '#111120' }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Domínio (opcional)</label>
            <input
              type="text"
              placeholder="cursosjoy.site"
              value={editDomain}
              onChange={e => setEditDomain(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
              style={{ background: '#111120' }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={() => setEditSite(null)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleEditSite} disabled={!editName.trim() || savingEdit}>
              {savingEdit && <Spinner size={14} />}
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!addPageSiteId} onClose={() => setAddPageSiteId(null)} title="Adicionar página(s)">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              URL completa, ou vários caminhos separados por vírgula/linha *
            </label>
            <textarea
              autoFocus
              rows={3}
              placeholder={'pv-b, pv-white, pressel\nou\nhttps://cursosjoy.site/qz-wl-vs-nv/'}
              value={pageUrl}
              onChange={e => setPageUrl(e.target.value)}
              className="w-full resize-none rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
              style={{ background: '#111120' }}
            />
            {(() => {
              const site = sites.find(s => s.id === addPageSiteId)
              if (!site?.dominio) {
                return (
                  <p className="mt-1 text-[11px] text-amber-500">
                    Esse site não tem domínio cadastrado — só aceita URLs completas (com https://). Edite o site pra adicionar um domínio e poder colar só os caminhos.
                  </p>
                )
              }
              const preview = buildPageUrls(pageUrl, site.dominio)
              if (preview.length === 0) return null
              return (
                <div className="mt-1.5 space-y-0.5">
                  {preview.map(u => (
                    <p key={u} className="truncate text-[11px] text-slate-500">→ {u}</p>
                  ))}
                </div>
              )
            })()}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={() => setAddPageSiteId(null)}>Cancelar</Button>
            <Button
              className="flex-1"
              onClick={handleAddPage}
              disabled={!pageUrl.trim() || addingPage || buildPageUrls(pageUrl, sites.find(s => s.id === addPageSiteId)?.dominio ?? null).length === 0}
            >
              {addingPage && <Spinner size={14} />}
              Adicionar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Confirmar exclusão">
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-400" />
            <p className="text-sm text-slate-200">
              {confirmDelete?.kind === 'site' ? (
                <>
                  Tem certeza que quer excluir o site <span className="font-semibold">&quot;{confirmDelete.label}&quot;</span>?
                  Todas as páginas cadastradas nele também serão excluídas e a checagem automática vai parar imediatamente. Essa ação não pode ser desfeita.
                </>
              ) : (
                <>
                  Tem certeza que quer excluir a página <span className="break-all font-semibold">{confirmDelete?.label}</span>?
                  A checagem automática dela vai parar imediatamente. Essa ação não pode ser desfeita.
                </>
              )}
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
    </div>
  )
}
