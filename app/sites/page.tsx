'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Pause, Play, Radio, ExternalLink, ShieldCheck, Pencil, RefreshCw, AlertTriangle, ChevronDown, ChevronRight, GripVertical, Copy, Check, Search, FolderPlus, Folder, MoreVertical } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ActionSheet } from '@/components/ui/ActionSheet'

const CLOAKER_MARKER_SNIPPET = '<!-- pagina:black -->'

type MonitoredPage = {
  id: string
  site_id: string
  url: string
  nome: string | null
  ordem: number
  pasta_id: string | null
  ativo: boolean
  ultimo_status: string | null
  ultimo_status_code: number | null
  ultimo_tempo_ms: number | null
  ultima_checagem_em: string | null
  verificar_cloaker: boolean
  ultimo_status_cloaker: string | null
}

type MonitoredPageFolder = {
  id: string
  site_id: string
  nome: string
  ordem: number
}

type MonitoredSite = {
  id: string
  user_id: string
  nome: string
  dominio: string | null
  ordem: number
  pages: MonitoredPage[]
  folders: MonitoredPageFolder[]
}

type ConfirmDelete = { kind: 'site' | 'page' | 'folder'; id: string; label: string }

// Ação que muda configuração (ativar/desativar cloacker, pausar/retomar) —
// sempre passa por um card de confirmação centralizado antes de executar.
type ConfirmPageAction =
  | { kind: 'cloaker-on'; page: MonitoredPage }
  | { kind: 'cloaker-off'; page: MonitoredPage }
  | { kind: 'pause'; page: MonitoredPage }
  | { kind: 'resume'; page: MonitoredPage }

const CONFIRM_ACTION_TEXT: Record<ConfirmPageAction['kind'], { title: string; body: (label: string) => string; confirmLabel: string }> = {
  'cloaker-on': {
    title: 'Ativar verificação de cloacker',
    body: label => `Ativar a verificação de cloacker pra "${label}"? A marcação foi encontrada na página — a partir de agora você recebe um alerta se ela sumir (ex: o cloacker parar de servir a página black).`,
    confirmLabel: 'Ativar',
  },
  'cloaker-off': {
    title: 'Desativar verificação de cloacker',
    body: label => `Desativar a verificação de cloacker pra "${label}"? Você para de receber alertas sobre a marcação nessa página.`,
    confirmLabel: 'Desativar',
  },
  pause: {
    title: 'Pausar checagem',
    body: label => `Pausar a checagem automática de "${label}"? Ela para de ser monitorada até você retomar.`,
    confirmLabel: 'Pausar',
  },
  resume: {
    title: 'Retomar checagem',
    body: label => `Retomar a checagem automática de "${label}"?`,
    confirmLabel: 'Retomar',
  },
}

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

// Resumo compacto pra quando a lista de páginas do site está oculta.
function summarizePages(pages: MonitoredPage[]): { emoji: string; label: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const page of pages) {
    const chave = !page.ativo ? 'pausado' : !page.ultima_checagem_em ? 'nunca' : (page.ultimo_status ?? 'nunca')
    counts[chave] = (counts[chave] ?? 0) + 1
  }
  const LABELS: Record<string, { emoji: string; label: string }> = {
    ...STATUS_INFO,
    pausado: { emoji: '⏸️', label: 'pausada' },
    nunca: { emoji: '⚪', label: 'nunca checada' },
  }
  return Object.entries(counts).map(([chave, count]) => ({
    emoji: LABELS[chave]?.emoji ?? '⚪',
    label: LABELS[chave]?.label ?? chave,
    count,
  }))
}

// Mostra só o caminho da URL (sem o domínio) já que o domínio já aparece no
// cartão do site — copiar/abrir continuam usando a URL completa (page.url).
function pagePath(url: string): string {
  try {
    const u = new URL(url)
    return `${u.pathname}${u.search}${u.hash}` || '/'
  } catch {
    return url
  }
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

// Agrupa as páginas de um site pelas pastas cadastradas, mantendo uma seção
// "sem pasta" pro que não foi organizado ainda (ordem entre as seções segue a
// ordem das pastas; a ordem dentro de cada seção segue MonitoredPage.ordem).
type PageGroup = { folder: MonitoredPageFolder | null; pages: MonitoredPage[] }

function groupPagesByFolder(site: MonitoredSite): PageGroup[] {
  // Pastas aparecem mesmo vazias (pra dar pra arrastar páginas pra dentro) —
  // só a seção "sem pasta" some quando não sobra nenhuma página solta.
  const groups: PageGroup[] = site.folders.map(folder => ({
    folder,
    pages: site.pages.filter(p => p.pasta_id === folder.id),
  }))
  const folderIds = new Set(site.folders.map(f => f.id))
  const semPasta = site.pages.filter(p => !p.pasta_id || !folderIds.has(p.pasta_id))
  if (semPasta.length > 0 || groups.length === 0) groups.push({ folder: null, pages: semPasta })
  return groups
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

  const [siteMenuFor, setSiteMenuFor] = useState<MonitoredSite | null>(null)
  const [pageMenuFor, setPageMenuFor] = useState<MonitoredPage | null>(null)

  const [checkingSiteId, setCheckingSiteId] = useState<string | null>(null)
  const [checkingAll, setCheckingAll] = useState(false)

  const [checkToast, setCheckToast] = useState<string | null>(null)
  function showCheckToast(message: string) {
    setCheckToast(message)
    setTimeout(() => setCheckToast(prev => (prev === message ? null : prev)), 3000)
  }

  const [copiedPageId, setCopiedPageId] = useState<string | null>(null)
  async function handleCopyUrl(pageId: string, url: string) {
    await navigator.clipboard.writeText(url)
    setCopiedPageId(pageId)
    setTimeout(() => setCopiedPageId(prev => (prev === pageId ? null : prev)), 2000)
  }

  const [copiedMarker, setCopiedMarker] = useState(false)
  async function handleCopyMarker() {
    await navigator.clipboard.writeText(CLOAKER_MARKER_SNIPPET)
    setCopiedMarker(true)
    setTimeout(() => setCopiedMarker(false), 2000)
  }

  const [checkingMarkerPageId, setCheckingMarkerPageId] = useState<string | null>(null)
  const [markerResult, setMarkerResult] = useState<{ page: MonitoredPage; found: boolean } | null>(null)
  const [checkingPageId, setCheckingPageId] = useState<string | null>(null)

  const [confirmAction, setConfirmAction] = useState<ConfirmPageAction | null>(null)
  const [confirmingAction, setConfirmingAction] = useState(false)

  const [editPage, setEditPage] = useState<MonitoredPage | null>(null)
  const [editPageNome, setEditPageNome] = useState('')
  const [editPageFolderId, setEditPageFolderId] = useState<string | null>(null)
  const [savingEditPage, setSavingEditPage] = useState(false)

  const [showCreateFolder, setShowCreateFolder] = useState<string | null>(null)
  const [folderName, setFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)

  const [pageDrag, setPageDrag] = useState<{ siteId: string; pageId: string } | null>(null)
  const [pageDragOverId, setPageDragOverId] = useState<string | null>(null)

  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set())
  function toggleExpanded(siteId: string) {
    setExpandedSites(prev => {
      const next = new Set(prev)
      if (next.has(siteId)) next.delete(siteId)
      else next.add(siteId)
      return next
    })
  }

  // Cada pasta abre/fecha independente, tipo um explorador de arquivos — só
  // mostra as páginas dela quando clicada. "Sem pasta" é o oposto: já vem
  // aberta de cara (é onde toda página nova cai antes de ser organizada),
  // só fecha se o usuário clicar pra fechar — por isso rastreamos ela numa
  // lista separada de "fechadas manualmente" em vez de "abertas".
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [manuallyClosedSemPasta, setManuallyClosedSemPasta] = useState<Set<string>>(new Set())
  function folderKey(siteId: string, folderId: string | null) {
    return `${siteId}:${folderId ?? 'sem-pasta'}`
  }
  function isFolderGroupOpen(siteId: string, folderId: string | null) {
    const key = folderKey(siteId, folderId)
    return folderId === null ? !manuallyClosedSemPasta.has(key) : expandedFolders.has(key)
  }
  function toggleFolderExpanded(siteId: string, folderId: string | null) {
    const key = folderKey(siteId, folderId)
    if (folderId === null) {
      setManuallyClosedSemPasta(prev => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      return
    }
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  function handleDrop(dropIndex: number) {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null)
      setDragOverIndex(null)
      return
    }
    const reordered = [...sites]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(dropIndex, 0, moved)
    setSites(reordered)
    setDragIndex(null)
    setDragOverIndex(null)
    void Promise.all(
      reordered.map((s, i) => supabase.from('monitored_sites').update({ ordem: i }).eq('id', s.id)),
    )
  }

  // `silent` evita o spinner de tela cheia (usado depois de um "checar agora"):
  // troca só os dados de `sites`, sem passar por loading=true, então a árvore de
  // sites/pastas abertas não desmonta nem perde a posição de rolagem/estado.
  const fetchSites = useCallback(async (uid: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    const { data } = await supabase
      .from('monitored_sites')
      .select('*, monitored_pages(*), monitored_page_folders(*)')
      .eq('user_id', uid)
      .order('ordem', { ascending: true })
    const mapped = ((data ?? []) as (MonitoredSite & { monitored_pages: MonitoredPage[]; monitored_page_folders: MonitoredPageFolder[] })[]).map(s => ({
      ...s,
      pages: (s.monitored_pages ?? []).slice().sort((a, b) => a.ordem - b.ordem),
      folders: (s.monitored_page_folders ?? []).slice().sort((a, b) => a.ordem - b.ordem),
    }))
    setSites(mapped)
    if (!opts?.silent) setLoading(false)
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
      folders: [] as MonitoredPageFolder[],
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
    const proximaOrdem = sites.length > 0 ? Math.max(...sites.map(s => s.ordem)) + 1 : 0
    await supabase.from('monitored_sites').insert({
      user_id: userId,
      nome: siteName.trim(),
      dominio: siteDomain.trim() || null,
      ordem: proximaOrdem,
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
    } else if (confirmDelete.kind === 'folder') {
      // Não precisa mover as páginas manualmente: pasta_id tem ON DELETE
      // SET NULL (migration 052), então elas caem sozinhas em "Sem pasta".
      await supabase.from('monitored_page_folders').delete().eq('id', confirmDelete.id)
    } else {
      await supabase.from('monitored_pages').delete().eq('id', confirmDelete.id)
    }
    setDeleting(false)
    setConfirmDelete(null)
    void fetchSites(userId)
  }

  function handleRequestTogglePage(page: MonitoredPage) {
    setConfirmAction({ kind: page.ativo ? 'pause' : 'resume', page })
  }

  async function checkMarkerFor(url: string): Promise<boolean> {
    try {
      const res = await fetch('/api/sites/check-marker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const json = await res.json().catch(() => ({}))
      return json?.status === 'ok'
    } catch {
      return false
    }
  }

  async function handleVerifyMarker(page: MonitoredPage) {
    setCheckingMarkerPageId(page.id)
    const found = await checkMarkerFor(page.url)
    setCheckingMarkerPageId(null)
    setMarkerResult({ page, found })
  }

  async function handleRequestToggleCloaker(page: MonitoredPage) {
    if (page.verificar_cloaker) {
      setConfirmAction({ kind: 'cloaker-off', page })
      return
    }
    setCheckingMarkerPageId(page.id)
    const found = await checkMarkerFor(page.url)
    setCheckingMarkerPageId(null)
    if (!found) {
      setMarkerResult({ page, found: false })
      return
    }
    setConfirmAction({ kind: 'cloaker-on', page })
  }

  async function handleConfirmAction() {
    if (!confirmAction || !userId) return
    setConfirmingAction(true)
    const { kind, page } = confirmAction
    if (kind === 'cloaker-on') await supabase.from('monitored_pages').update({ verificar_cloaker: true }).eq('id', page.id)
    else if (kind === 'cloaker-off') await supabase.from('monitored_pages').update({ verificar_cloaker: false }).eq('id', page.id)
    else if (kind === 'pause') await supabase.from('monitored_pages').update({ ativo: false }).eq('id', page.id)
    else if (kind === 'resume') await supabase.from('monitored_pages').update({ ativo: true }).eq('id', page.id)
    setConfirmingAction(false)
    setConfirmAction(null)
    void fetchSites(userId)
  }

  async function handleCheckPageNow(pageId: string) {
    if (!userId) return
    setCheckingPageId(pageId)
    try {
      await fetch('/api/sites/check-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId }),
      })
      showCheckToast('Página checada agora')
    } finally {
      setCheckingPageId(null)
      void fetchSites(userId, { silent: true })
    }
  }

  function openEditPage(page: MonitoredPage) {
    setEditPage(page)
    setEditPageNome(page.nome ?? '')
    setEditPageFolderId(page.pasta_id)
  }

  async function handleSavePageEdit() {
    if (!editPage || !userId) return
    setSavingEditPage(true)
    await supabase
      .from('monitored_pages')
      .update({ nome: editPageNome.trim() || null, pasta_id: editPageFolderId })
      .eq('id', editPage.id)
    setSavingEditPage(false)
    setEditPage(null)
    void fetchSites(userId)
  }

  async function handleCreateFolder(siteId: string) {
    if (!folderName.trim() || !userId) return
    setCreatingFolder(true)
    const site = sites.find(s => s.id === siteId)
    const proximaOrdem = site && site.folders.length > 0 ? Math.max(...site.folders.map(f => f.ordem)) + 1 : 0
    await supabase.from('monitored_page_folders').insert({ site_id: siteId, nome: folderName.trim(), ordem: proximaOrdem })
    setCreatingFolder(false)
    setShowCreateFolder(null)
    setFolderName('')
    void fetchSites(userId)
  }

  // Cobre tanto reordenar dentro da mesma pasta quanto arrastar pra uma pasta
  // diferente (ou pra "sem pasta") — nesse caso também atualiza pasta_id.
  function handlePageDrop(site: MonitoredSite, targetGroup: PageGroup, dropIndex: number) {
    if (!userId || !pageDrag || pageDrag.siteId !== site.id) { setPageDrag(null); setPageDragOverId(null); return }
    const draggedPage = site.pages.find(p => p.id === pageDrag.pageId)
    if (!draggedPage) { setPageDrag(null); setPageDragOverId(null); return }
    const targetFolderId = targetGroup.folder?.id ?? null
    const sameGroup = (draggedPage.pasta_id ?? null) === targetFolderId
    if (sameGroup && targetGroup.pages.findIndex(p => p.id === draggedPage.id) === dropIndex) {
      setPageDrag(null)
      setPageDragOverId(null)
      return
    }
    const basePages = targetGroup.pages.filter(p => p.id !== draggedPage.id)
    const clampedIndex = Math.min(dropIndex, basePages.length)
    const reordered = [...basePages]
    reordered.splice(clampedIndex, 0, draggedPage)
    setPageDrag(null)
    setPageDragOverId(null)
    void Promise.all(
      reordered.map((p, i) => supabase.from('monitored_pages').update({ ordem: i, pasta_id: targetFolderId }).eq('id', p.id)),
    ).then(() => fetchSites(userId))
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
      showCheckToast('Site checado agora')
    } finally {
      setCheckingSiteId(null)
      void fetchSites(userId, { silent: true })
    }
  }

  async function handleCheckAll() {
    if (!userId) return
    setCheckingAll(true)
    try {
      await fetch('/api/sites/check-now', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      showCheckToast('Todos os sites foram checados')
    } finally {
      setCheckingAll(false)
      void fetchSites(userId, { silent: true })
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#0b0b14' }}>
      <header className="border-b" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(11,11,20,0.95)' }}>
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
              <Radio size={16} className="text-indigo-400" />
            </div>
            <span className="text-sm font-bold text-slate-100">Sites monitorados</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {sites.length > 0 && (
              <Button onClick={handleCheckAll} size="sm" variant="outline" disabled={checkingAll}>
                {checkingAll ? <Spinner size={14} /> : <RefreshCw size={14} />}
                <span className="hidden sm:inline">Checar tudo agora</span>
              </Button>
            )}
            <Button onClick={() => setShowCreateSite(true)} size="sm">
              <Plus size={14} />
              <span className="hidden sm:inline">Novo site</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-100">Sites</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Suas páginas de anúncio são checadas automaticamente de hora em hora. Você recebe uma
            notificação push quando alguma cair, der erro ou ficar lenta (mais de 10s).
          </p>
        </div>

        <div className="mb-6 rounded-xl border p-4" style={{ background: '#13131f', borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-cyan-400" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-slate-200">Verificação de cloacker</h2>
              <p className="mt-1 text-xs text-slate-500">
                Pra ativar a checagem de cloacker numa página, cole essa marcação na página <strong>black</strong> (a
                que o visitante real vê) — pode ir no <code className="rounded bg-white/10 px-1 py-0.5 text-[11px] text-slate-300">&lt;head&gt;</code> ou
                solto no corpo, desde que esteja no HTML entregue pelo servidor (não funciona se for inserida via JavaScript).
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg px-3 py-2 text-xs text-cyan-300" style={{ background: '#0b0b14' }}>
                  {CLOAKER_MARKER_SNIPPET}
                </code>
                <button
                  onClick={handleCopyMarker}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  {copiedMarker ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                  {copiedMarker ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-600">
                Depois de colar a marcação, use o botão de lupa em cada página abaixo pra verificar se ela foi encontrada,
                e o escudo (<ShieldCheck size={10} className="inline" />) pra ativar a checagem — se a marcação não for
                encontrada, a ativação é bloqueada e você vê um aviso.
              </p>
            </div>
          </div>
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
            {sites.map((site, index) => (
              <div
                key={site.id}
                onDragOver={e => { e.preventDefault(); setDragOverIndex(index) }}
                onDragLeave={() => setDragOverIndex(prev => (prev === index ? null : prev))}
                onDrop={e => { e.preventDefault(); handleDrop(index) }}
                className="rounded-xl border p-4 transition-colors"
                style={{
                  background: '#191929',
                  borderColor: dragOverIndex === index && dragIndex !== null && dragIndex !== index
                    ? 'rgba(99,102,241,0.6)'
                    : 'rgba(255,255,255,0.07)',
                  opacity: dragIndex === index ? 0.4 : 1,
                }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-1">
                    <span
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
                      className="hidden cursor-grab p-1 text-slate-600 hover:text-slate-400 active:cursor-grabbing sm:inline-flex"
                      title="Arrastar pra reordenar"
                    >
                      <GripVertical size={15} />
                    </span>
                    <button
                      onClick={() => toggleExpanded(site.id)}
                      className="flex min-w-0 items-center gap-2 py-1 text-left"
                      disabled={site.pages.length === 0 && site.folders.length === 0}
                    >
                    {(site.pages.length > 0 || site.folders.length > 0) && (
                      expandedSites.has(site.id)
                        ? <ChevronDown size={15} className="shrink-0 text-slate-500" />
                        : <ChevronRight size={15} className="shrink-0 text-slate-500" />
                    )}
                    <span className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-slate-100">{site.nome}</h3>
                      {site.dominio && <p className="truncate text-xs text-slate-500">{site.dominio}</p>}
                    </span>
                    </button>
                  </div>
                  <div className="hidden items-center gap-1 sm:flex">
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
                  <button
                    onClick={() => setSiteMenuFor(site)}
                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300 sm:hidden"
                    title="Mais opções"
                  >
                    <MoreVertical size={16} />
                  </button>
                </div>

                {site.pages.length === 0 && site.folders.length === 0 ? (
                  <p className="text-xs text-slate-600">Nenhuma página cadastrada nesse site ainda.</p>
                ) : !expandedSites.has(site.id) ? (
                  <button
                    onClick={() => toggleExpanded(site.id)}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 hover:text-slate-300"
                  >
                    <span>{site.pages.length} página{site.pages.length !== 1 ? 's' : ''}</span>
                    {site.folders.length > 0 && <span>· {site.folders.length} pasta{site.folders.length > 1 ? 's' : ''}</span>}
                    {summarizePages(site.pages).map(s => (
                      <span key={s.label}>{s.emoji} {s.count} {s.label}</span>
                    ))}
                  </button>
                ) : (
                  <div className="space-y-3">
                    {groupPagesByFolder(site).map(group => {
                      const key = folderKey(site.id, group.folder?.id ?? null)
                      const isFolderOpen = isFolderGroupOpen(site.id, group.folder?.id ?? null)
                      return (
                      <div
                        key={key}
                        onDragOver={e => { if (pageDrag) e.preventDefault() }}
                        onDrop={e => { e.preventDefault(); handlePageDrop(site, group, group.pages.length) }}
                      >
                        <div className="mb-1 flex items-center gap-1.5 px-1">
                          <button
                            onClick={() => toggleFolderExpanded(site.id, group.folder?.id ?? null)}
                            className="flex flex-1 items-center gap-1.5 text-left hover:text-slate-400"
                          >
                            {isFolderOpen ? <ChevronDown size={12} className="shrink-0 text-slate-600" /> : <ChevronRight size={12} className="shrink-0 text-slate-600" />}
                            {group.folder ? <Folder size={11} className="shrink-0 text-slate-600" /> : null}
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                              {group.folder ? group.folder.nome : 'Sem pasta'}
                            </span>
                            <span className="text-[10px] text-slate-700">({group.pages.length})</span>
                          </button>
                          {group.folder && (
                            <button
                              onClick={() => setConfirmDelete({ kind: 'folder', id: group.folder!.id, label: group.folder!.nome })}
                              className="shrink-0 rounded-lg p-1 text-slate-600 transition-colors hover:bg-red-500/15 hover:text-red-400"
                              title="Excluir pasta"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                        {isFolderOpen && (
                        <div className="space-y-1.5">
                          {group.pages.length === 0 && (
                            <div
                              className="rounded-lg border border-dashed px-3 py-3 text-center text-[11px] text-slate-600"
                              style={{ borderColor: pageDrag ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)' }}
                            >
                              Arraste uma página pra cá
                            </div>
                          )}
                          {group.pages.map((page, idx) => {
                            const info = statusInfo(page)
                            return (
                              <div
                                key={page.id}
                                draggable
                                onDragStart={() => setPageDrag({ siteId: site.id, pageId: page.id })}
                                onDragEnd={() => { setPageDrag(null); setPageDragOverId(null) }}
                                onDragOver={e => { e.preventDefault(); setPageDragOverId(page.id) }}
                                onDragLeave={() => setPageDragOverId(prev => (prev === page.id ? null : prev))}
                                onDrop={e => { e.preventDefault(); e.stopPropagation(); handlePageDrop(site, group, idx) }}
                                className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors"
                                style={{
                                  background: 'rgba(255,255,255,0.03)',
                                  boxShadow: pageDragOverId === page.id && pageDrag && pageDrag.pageId !== page.id ? 'inset 0 0 0 1px rgba(99,102,241,0.6)' : undefined,
                                  opacity: pageDrag?.pageId === page.id ? 0.4 : (page.ativo ? 1 : 0.5),
                                }}
                              >
                                <span className="hidden cursor-grab p-0.5 text-slate-700 hover:text-slate-500 active:cursor-grabbing sm:inline-flex" title="Arrastar pra reordenar">
                                  <GripVertical size={13} />
                                </span>
                                <span className="text-base">{page.ativo ? info.emoji : '⏸️'}</span>
                                <div className="min-w-0 flex-1">
                                  <a href={page.url} target="_blank" rel="noreferrer" title={page.url} className="flex items-center gap-1 truncate py-1 text-xs font-medium text-slate-200 hover:text-indigo-300 sm:py-0">
                                    {page.nome || pagePath(page.url)}
                                    <ExternalLink size={10} className="shrink-0" />
                                  </a>
                                  {page.nome && <p className="truncate text-[10px] text-slate-600" title={page.url}>{pagePath(page.url)}</p>}
                                  <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                                    <p className={`text-[11px] ${page.ativo ? info.cor : 'text-slate-600'}`}>
                                      {page.ativo ? info.label : 'Pausado'}
                                      {page.ultimo_status_code ? ` · HTTP ${page.ultimo_status_code}` : ''}
                                      {page.ultimo_tempo_ms ? ` · ${page.ultimo_tempo_ms}ms` : ''}
                                      {' · checado '}{tempoRelativo(page.ultima_checagem_em)}
                                    </p>
                                    {page.verificar_cloaker && (
                                      <span
                                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                                        style={{
                                          background: page.ultimo_status_cloaker === 'falhou'
                                            ? 'linear-gradient(135deg, #f87171, #b91c1c)'
                                            : page.ultimo_status_cloaker === 'ok'
                                              ? 'linear-gradient(135deg, #4ade80, #15803d)'
                                              : 'linear-gradient(135deg, #64748b, #334155)',
                                        }}
                                      >
                                        cloacker {page.ultimo_status_cloaker === 'falhou' ? 'fora do ar 🚨' : page.ultimo_status_cloaker === 'ok' ? 'ok' : 'não checado'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="hidden items-center gap-1 sm:flex">
                                  <button
                                    onClick={() => handleCheckPageNow(page.id)}
                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                                    title="Checar essa página agora"
                                    disabled={checkingPageId === page.id}
                                  >
                                    {checkingPageId === page.id ? <Spinner size={12} /> : <RefreshCw size={12} />}
                                  </button>
                                  <button
                                    onClick={() => handleVerifyMarker(page)}
                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                                    title="Verificar marcação de cloacker"
                                    disabled={checkingMarkerPageId === page.id}
                                  >
                                    {checkingMarkerPageId === page.id ? <Spinner size={12} /> : <Search size={12} />}
                                  </button>
                                  <button
                                    onClick={() => handleRequestToggleCloaker(page)}
                                    className={`rounded-lg p-1.5 transition-colors hover:bg-white/10 ${page.verificar_cloaker ? 'text-cyan-400' : 'text-slate-600 hover:text-slate-300'}`}
                                    title={page.verificar_cloaker ? 'Verificação de cloacker ativada (clique pra desativar)' : 'Ativar verificação de cloacker'}
                                    disabled={checkingMarkerPageId === page.id}
                                  >
                                    {checkingMarkerPageId === page.id ? <Spinner size={12} /> : <ShieldCheck size={12} />}
                                  </button>
                                  <button
                                    onClick={() => openEditPage(page)}
                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                                    title="Editar página"
                                  >
                                    <Pencil size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleCopyUrl(page.id, page.url)}
                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                                    title={copiedPageId === page.id ? 'Copiado!' : 'Copiar URL'}
                                  >
                                    {copiedPageId === page.id ? <Check size={12} /> : <Copy size={12} />}
                                  </button>
                                  <button
                                    onClick={() => handleRequestTogglePage(page)}
                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                                    title={page.ativo ? 'Pausar checagem' : 'Retomar checagem'}
                                  >
                                    {page.ativo ? <Pause size={12} /> : <Play size={12} />}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete({ kind: 'page', id: page.id, label: page.nome || page.url })}
                                    className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-400"
                                    title="Excluir página"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                                <button
                                  onClick={() => setPageMenuFor(page)}
                                  className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300 sm:hidden"
                                  title="Mais opções"
                                >
                                  <MoreVertical size={16} />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                        )}
                      </div>
                      )
                    })}
                    <button
                      onClick={() => setShowCreateFolder(site.id)}
                      className="flex items-center gap-1.5 px-1 text-[11px] text-slate-600 hover:text-slate-400"
                    >
                      <FolderPlus size={11} />
                      Nova pasta
                    </button>
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
                            <span className="min-w-0 flex-1 truncate text-slate-400" title={page.url}>{pagePath(page.url)}</span>
                            <span className={`shrink-0 ${info.cor}`}>{info.label}</span>
                            <button
                              onClick={() => handleCopyUrl(page.id, page.url)}
                              className="ml-auto shrink-0 rounded-lg p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                              title={copiedPageId === page.id ? 'Copiado!' : 'Copiar URL'}
                            >
                              {copiedPageId === page.id ? <Check size={11} /> : <Copy size={11} />}
                            </button>
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

      {checkToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-emerald-500/90 px-4 py-3 text-sm font-medium text-white shadow-lg backdrop-blur-sm">
          <Check size={16} />
          <span>{checkToast}</span>
        </div>
      )}

      <ActionSheet
        open={!!siteMenuFor}
        onClose={() => setSiteMenuFor(null)}
        title={siteMenuFor?.nome}
        items={siteMenuFor ? [
          { key: 'check', label: 'Checar agora', icon: <RefreshCw size={16} />, onClick: () => handleCheckNow(siteMenuFor.id) },
          { key: 'edit', label: 'Editar site', icon: <Pencil size={16} />, onClick: () => openEditSite(siteMenuFor) },
          { key: 'add-page', label: 'Adicionar página(s)', icon: <Plus size={16} />, onClick: () => setAddPageSiteId(siteMenuFor.id) },
          { key: 'delete', label: 'Excluir site', icon: <Trash2 size={16} />, onClick: () => setConfirmDelete({ kind: 'site', id: siteMenuFor.id, label: siteMenuFor.nome }), destructive: true },
        ] : []}
      />

      <ActionSheet
        open={!!pageMenuFor}
        onClose={() => setPageMenuFor(null)}
        title={pageMenuFor?.nome || (pageMenuFor ? pagePath(pageMenuFor.url) : undefined)}
        items={pageMenuFor ? [
          { key: 'check', label: 'Checar agora', icon: <RefreshCw size={16} />, onClick: () => handleCheckPageNow(pageMenuFor.id) },
          { key: 'verify-marker', label: 'Verificar marcação de cloacker', icon: <Search size={16} />, onClick: () => handleVerifyMarker(pageMenuFor) },
          {
            key: 'toggle-cloaker',
            label: pageMenuFor.verificar_cloaker ? 'Desativar verificação de cloacker' : 'Ativar verificação de cloacker',
            icon: <ShieldCheck size={16} />,
            onClick: () => handleRequestToggleCloaker(pageMenuFor),
          },
          { key: 'edit', label: 'Editar página', icon: <Pencil size={16} />, onClick: () => openEditPage(pageMenuFor) },
          { key: 'copy', label: 'Copiar URL', icon: <Copy size={16} />, onClick: () => handleCopyUrl(pageMenuFor.id, pageMenuFor.url) },
          {
            key: 'toggle-active',
            label: pageMenuFor.ativo ? 'Pausar checagem' : 'Retomar checagem',
            icon: pageMenuFor.ativo ? <Pause size={16} /> : <Play size={16} />,
            onClick: () => handleRequestTogglePage(pageMenuFor),
          },
          {
            key: 'delete',
            label: 'Excluir página',
            icon: <Trash2 size={16} />,
            onClick: () => setConfirmDelete({ kind: 'page', id: pageMenuFor.id, label: pageMenuFor.nome || pageMenuFor.url }),
            destructive: true,
          },
        ] : []}
      />

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
              ) : confirmDelete?.kind === 'folder' ? (
                <>
                  Tem certeza que quer excluir a pasta <span className="font-semibold">&quot;{confirmDelete.label}&quot;</span>?
                  As páginas dela <strong>não</strong> serão excluídas — só voltam pra &quot;Sem pasta&quot;. Essa ação não pode ser desfeita.
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

      <Modal open={!!confirmAction} onClose={() => setConfirmAction(null)} title={confirmAction ? CONFIRM_ACTION_TEXT[confirmAction.kind].title : ''}>
        {confirmAction && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              {CONFIRM_ACTION_TEXT[confirmAction.kind].body(confirmAction.page.nome || pagePath(confirmAction.page.url))}
            </p>
            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setConfirmAction(null)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleConfirmAction} disabled={confirmingAction}>
                {confirmingAction && <Spinner size={14} />}
                {CONFIRM_ACTION_TEXT[confirmAction.kind].confirmLabel}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!markerResult} onClose={() => setMarkerResult(null)} title={markerResult?.found ? 'Marcação encontrada' : 'Marcação não encontrada'}>
        {markerResult && (
          <div className="space-y-4">
            <div className={`flex gap-3 rounded-xl border p-3 ${markerResult.found ? 'border-green-500/20 bg-green-500/10' : 'border-red-500/20 bg-red-500/10'}`}>
              {markerResult.found
                ? <ShieldCheck size={18} className="mt-0.5 shrink-0 text-green-400" />
                : <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-400" />}
              <p className="text-sm text-slate-200">
                {markerResult.found ? (
                  <>A marcação <code className="rounded bg-white/10 px-1">{CLOAKER_MARKER_SNIPPET}</code> foi encontrada em{' '}
                  <span className="break-all font-semibold">{markerResult.page.url}</span>.</>
                ) : (
                  <>Não encontrei a marcação <code className="rounded bg-white/10 px-1">{CLOAKER_MARKER_SNIPPET}</code> em{' '}
                  <span className="break-all font-semibold">{markerResult.page.url}</span>. Confira se ela foi colada na
                  página black e se não está sendo inserida via JavaScript (precisa estar no HTML que o servidor entrega).</>
                )}
              </p>
            </div>
            <Button className="w-full" onClick={() => setMarkerResult(null)}>Entendi</Button>
          </div>
        )}
      </Modal>

      <Modal open={!!editPage} onClose={() => setEditPage(null)} title="Editar página">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Nome (opcional)</label>
            <input
              autoFocus
              type="text"
              placeholder={editPage ? pagePath(editPage.url) : ''}
              value={editPageNome}
              onChange={e => setEditPageNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSavePageEdit()}
              className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
              style={{ background: '#111120' }}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Pasta</label>
            <select
              value={editPageFolderId ?? ''}
              onChange={e => setEditPageFolderId(e.target.value || null)}
              className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
              style={{ background: '#111120' }}
            >
              <option value="">Sem pasta</option>
              {editPage && sites.find(s => s.id === editPage.site_id)?.folders.map(f => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
            <button
              onClick={() => { if (editPage) setShowCreateFolder(editPage.site_id) }}
              className="mt-1.5 flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
            >
              <FolderPlus size={11} />
              Criar nova pasta
            </button>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={() => setEditPage(null)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleSavePageEdit} disabled={savingEditPage}>
              {savingEditPage && <Spinner size={14} />}
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!showCreateFolder} onClose={() => setShowCreateFolder(null)} title="Nova pasta">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Nome *</label>
            <input
              autoFocus
              type="text"
              placeholder="Ex: Campanha A"
              value={folderName}
              onChange={e => setFolderName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && showCreateFolder && handleCreateFolder(showCreateFolder)}
              className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 outline-none ring-1 ring-white/10 focus:ring-indigo-500/60"
              style={{ background: '#111120' }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={() => setShowCreateFolder(null)}>Cancelar</Button>
            <Button
              className="flex-1"
              onClick={() => showCreateFolder && handleCreateFolder(showCreateFolder)}
              disabled={!folderName.trim() || creatingFolder}
            >
              {creatingFolder && <Spinner size={14} />}
              Criar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
