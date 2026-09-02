'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'

type RecentEvent = {
  event_name: string
  source: string
  session_hit: boolean | null
  capi_send_ok: boolean | null
  received_at: string
  ip: string | null
  fbp: string | null
  fbc: string | null
  session_id: string | null
  geo_city: string | null
  geo_region: string | null
  geo_country: string | null
  url: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  src: string | null
}

type Summary = {
  counts_today: Record<string, number>
  coverage_today: {
    total: number
    with_fbp_pct: number | null
    with_fbc_pct: number | null
    purchase_session_matched_pct: number | null
  }
  vendas_trackeadas: number
  vendas_nao_trackeadas: number
}

type EventName = 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase'

type SectionState = {
  open: boolean
  loading: boolean // busca inicial (primeiro open ou troca de data)
  loadingMore: boolean // busca do "carregar mais"
  error: string | null
  events: RecentEvent[] | null // null = nunca foi aberta/buscada ainda
  offset: number
  hasMore: boolean
}

const EVENT_TYPES: EventName[] = ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase']
const PAGE_SIZE = 50

const EVENT_ICON: Record<string, string> = {
  PageView: '👁️',
  ViewContent: '📄',
  AddToCart: '🛍️',
  InitiateCheckout: '🛒',
  Purchase: '💰',
}

const REFRESH_INTERVAL_MS = 10_000

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 10) return 'agora mesmo'
  if (sec < 60) return `há ${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

// Data/hora completa (no fuso do navegador de quem tá olhando o painel) —
// pra comparar direto com o horário que a Hotmart mostra, "há Xs" sozinho
// não dá pra bater o olho com um horário exato.
function exactTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Últimos 14 dias (mesmo período de retenção) — o usuário escolhe qual dia
// carregar em vez de um limite fixo de linhas.
function dateOptions(): { value: string; label: string }[] {
  const now = new Date()
  const opts: { value: string; label: string }[] = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const value = toLocalDateKey(d)
    const label = i === 0
      ? 'Hoje'
      : i === 1
        ? 'Ontem'
        : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
    opts.push({ value, label })
  }
  return opts
}

function dayRangeToISO(dateKey: string): { start: string; end: string } {
  const [y, m, d] = dateKey.split('-').map(Number)
  const start = new Date(y, m - 1, d, 0, 0, 0, 0)
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0)
  return { start: start.toISOString(), end: end.toISOString() }
}

function geoLabel(e: RecentEvent): string | null {
  const parts = [e.geo_city, e.geo_region, e.geo_country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

function pageSlug(url: string | null): string | null {
  if (!url) return null
  try {
    const path = new URL(url).pathname
    return path && path !== '/' ? path : '/'
  } catch {
    return null
  }
}

function originLabel(e: RecentEvent): { label: string; className: string } {
  if (e.fbc) return { label: '📱 Facebook Ads', className: 'text-blue-300' }
  if (e.utm_source) return { label: `🔗 ${e.utm_source}`, className: 'text-indigo-300' }
  // "src" é o campo que a Hotmart já manda mesmo quando não tem fbc/utm (ex:
  // compras de order bump/upsell, que não passam por uma nova página com
  // sessão) — melhor sinal de origem do que nada, não devia cair em
  // "Direto/Orgânico" só porque faltou fbc/utm.
  if (e.src) return { label: `🏷️ ${e.src}`, className: 'text-teal-300' }
  return { label: '🌐 Direto/Orgânico', className: 'text-slate-400' }
}

function CoverageBar({ label, pct }: { label: string; pct: number | null }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>{label}</span>
        <span className="font-semibold text-slate-300">{pct === null ? '—' : `${pct}%`}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-indigo-500"
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  )
}

function EventRow({ e }: { e: RecentEvent }) {
  const origin = originLabel(e)
  const geo = geoLabel(e)
  const slug = pageSlug(e.url)
  const isMonitorOnly = e.source === 'pixel'

  return (
    <div className="space-y-1.5 rounded-lg px-2.5 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-medium text-slate-300">
          <span>{EVENT_ICON[e.event_name] ?? '📍'}</span>
          {e.event_name}
          {e.event_name === 'Purchase' && (
            <span className={e.session_hit ? 'text-green-400' : 'text-amber-400'} title={e.session_hit ? 'Sessão cruzada' : 'Não achou a sessão de navegação'}>
              {e.session_hit ? '✅' : '⚠️'}
            </span>
          )}
          {isMonitorOnly && (
            <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] font-normal normal-case text-slate-500" title="Estimativa por clique no link de checkout — não é o InitiateCheckout de verdade da Meta, que continua vindo do pixel nativo da Hotmart">
              detectado, não enviado à Meta
            </span>
          )}
          {e.source === 'capi' && e.capi_send_ok === false && (
            <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-normal normal-case text-red-400" title="A Meta recusou esse envio (token inválido, erro da API, etc.) — apesar de aparecer aqui, esse evento NÃO chegou lá">
              ❌ falhou envio à Meta
            </span>
          )}
        </span>
        <span className="text-right text-slate-600">
          <span className="block font-mono text-slate-400">{exactTime(e.received_at)}</span>
          <span className="block text-[10px]">{relativeTime(e.received_at)}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span className={origin.className}>{origin.label}</span>
        {slug && <span>📄 {slug}</span>}
        {geo && <span>📍 {geo}</span>}
        {e.ip && <span className="font-mono">IP: {e.ip}</span>}
        {e.session_id && (
          <span className="font-mono text-slate-600" title="ID interno da sessão de navegação — usado pra cruzar essa visita com uma compra depois">
            sid:{e.session_id.slice(0, 8)}
          </span>
        )}
      </div>
      {(e.utm_source || e.utm_medium || e.utm_campaign || e.src) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
          {e.utm_source && <span>utm_source: <span className="text-slate-400">{e.utm_source}</span></span>}
          {e.utm_medium && <span>utm_medium: <span className="text-slate-400">{e.utm_medium}</span></span>}
          {e.utm_campaign && <span>utm_campaign: <span className="text-slate-400">{e.utm_campaign}</span></span>}
          {e.src && <span>src: <span className="text-slate-400">{e.src}</span></span>}
        </div>
      )}
    </div>
  )
}

function EventTypeSection({
  eventName, countBadge, section, onToggle, onLoadMore,
}: {
  eventName: EventName
  countBadge: number
  section: SectionState
  onToggle: () => void
  onLoadMore: () => void
}) {
  return (
    <div className="rounded-xl ring-1 ring-white/10" style={{ background: '#111120' }}>
      <button onClick={onToggle} className="flex w-full items-center justify-between px-3 py-2.5 text-left">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <span>{EVENT_ICON[eventName]}</span>
          {eventName}
          <span className="text-xs font-normal text-slate-500">({countBadge})</span>
          {section.loading && <Spinner size={12} />}
        </span>
        {section.open ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
      </button>
      {section.open && (
        <div className="border-t border-white/10">
          {/* Rolagem própria da seção (não da página) — senão uma seção com
              muitos eventos empurra as outras duas pra longe. */}
          <div className="max-h-80 space-y-1.5 overflow-y-auto p-3">
            {section.error ? (
              <p className="text-xs text-red-300">{section.error}</p>
            ) : section.events === null ? null : section.events.length === 0 ? (
              <p className="text-xs text-slate-600">Nenhum evento nesse dia.</p>
            ) : (
              section.events.map((e, i) => <EventRow key={i} e={e} />)
            )}
          </div>
          {section.events !== null && section.events.length > 0 && (section.hasMore || section.loadingMore) && (
            <div className="flex justify-center border-t border-white/5 p-2">
              <button
                onClick={onLoadMore}
                disabled={section.loadingMore}
                className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 disabled:opacity-50"
              >
                {section.loadingMore && <Spinner size={11} />}
                {section.loadingMore ? 'Carregando...' : 'Carregar mais'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function makeInitialSections(): Record<EventName, SectionState> {
  const empty: SectionState = { open: false, loading: false, loadingMore: false, error: null, events: null, offset: 0, hasMore: false }
  return {
    PageView: { ...empty },
    ViewContent: { ...empty },
    AddToCart: { ...empty },
    InitiateCheckout: { ...empty },
    Purchase: { ...empty },
  }
}

export function EventsPanel({ installationId }: { installationId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalDateKey(new Date()))
  const [sections, setSections] = useState<Record<EventName, SectionState>>(makeInitialSections)
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const isMountedRef = useRef(true)
  const selectedDateRef = useRef(selectedDate)
  const sectionsRef = useRef(sections)

  useEffect(() => { sectionsRef.current = sections }, [sections])

  async function load(showSpinner: boolean, dateKey: string = selectedDateRef.current) {
    if (showSpinner) setLoading(true)
    setError(null)
    const { start, end } = dayRangeToISO(dateKey)
    const params = new URLSearchParams({ installation_id: installationId, start, end })
    const res = await fetch(`/api/track/events/summary?${params.toString()}`)
    const json = await res.json().catch(() => ({}))
    if (!isMountedRef.current) return
    // Mesma proteção do fetchSection: se a data já mudou de novo enquanto
    // essa resposta estava a caminho, descarta.
    if (dateKey !== selectedDateRef.current) return
    if (!res.ok) {
      setError(json?.error || 'Não foi possível carregar os eventos.')
      setLoading(false)
      return
    }
    setSummary(json)
    setLoading(false)
  }

  // append=false busca a 1ª página (troca a lista); append=true busca a
  // próxima e acrescenta ("carregar mais"). limit é sobrescrito só no
  // refresh automático, pra atualizar exatamente o que já tava carregado
  // sem resetar o "carregar mais" que o usuário já tinha clicado.
  async function fetchSection(eventName: EventName, dateKey: string, offset: number, append: boolean, limit: number = PAGE_SIZE) {
    setSections(prev => ({ ...prev, [eventName]: { ...prev[eventName], loading: !append, loadingMore: append, error: null } }))
    const { start, end } = dayRangeToISO(dateKey)
    const params = new URLSearchParams({
      installation_id: installationId, event_name: eventName, start, end,
      limit: String(limit), offset: String(offset),
    })
    const res = await fetch(`/api/track/events/list?${params.toString()}`)
    const json = await res.json().catch(() => ({}))
    if (!isMountedRef.current) return
    // Se a data já mudou de novo enquanto essa resposta estava a caminho,
    // descarta — senão uma resposta lenta do dia anterior pode sobrescrever
    // a seção com dados do dia errado.
    if (dateKey !== selectedDateRef.current) return
    if (!res.ok) {
      setSections(prev => ({ ...prev, [eventName]: { ...prev[eventName], loading: false, loadingMore: false, error: json?.error || 'Não foi possível carregar os eventos.' } }))
      return
    }
    const newEvents = (json.events ?? []) as RecentEvent[]
    setSections(prev => ({
      ...prev,
      [eventName]: {
        ...prev[eventName],
        loading: false,
        loadingMore: false,
        error: null,
        events: append ? [...(prev[eventName].events ?? []), ...newEvents] : newEvents,
        offset: offset + newEvents.length,
        hasMore: Boolean(json.hasMore),
      },
    }))
  }

  function toggleSection(eventName: EventName) {
    const current = sections[eventName]
    const willOpen = !current.open
    setSections(prev => ({ ...prev, [eventName]: { ...prev[eventName], open: willOpen } }))
    if (willOpen && current.events === null) void fetchSection(eventName, selectedDate, 0, false)
  }

  function loadMore(eventName: EventName) {
    const current = sections[eventName]
    if (current.loadingMore || !current.hasMore) return
    void fetchSection(eventName, selectedDate, current.offset, true)
  }

  function handleDateChange(newDate: string) {
    setSelectedDate(newDate)
    selectedDateRef.current = newDate
    void load(true, newDate)
    EVENT_TYPES.forEach(ev => {
      if (sections[ev].open) void fetchSection(ev, newDate, 0, false)
    })
  }

  // Botão "Atualizar": antes só recarregava os contadores do topo — agora
  // também refaz toda seção já aberta (mantendo o tanto que já tava
  // carregado), num clique só, em vez de precisar fechar/reabrir a setinha
  // pra ver dado novo ali.
  async function handleManualRefresh() {
    setManualRefreshing(true)
    try {
      await Promise.all([
        load(true),
        ...EVENT_TYPES
          .filter(ev => sections[ev].open)
          .map(ev => fetchSection(ev, selectedDate, 0, false, sections[ev].events?.length || PAGE_SIZE)),
      ])
    } finally {
      setManualRefreshing(false)
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    void load(true)
    // Painel "ao vivo": atualiza sozinho enquanto estiver aberto, sem precisar
    // clicar em Atualizar toda hora — só quando a data selecionada é hoje,
    // já que um dia passado é histórico e não muda mais. O refresh mantém o
    // tamanho da página que já tava carregada (não desfaz o "carregar mais").
    const interval = setInterval(() => {
      const today = toLocalDateKey(new Date())
      if (selectedDateRef.current !== today) return
      void load(false)
      EVENT_TYPES.forEach(ev => {
        const sec = sectionsRef.current[ev]
        if (sec.open) void fetchSection(ev, selectedDateRef.current, 0, false, sec.events?.length || PAGE_SIZE)
      })
    }, REFRESH_INTERVAL_MS)
    return () => {
      isMountedRef.current = false
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installationId])

  if (loading) return <div className="flex justify-center py-6"><Spinner size={18} /></div>
  if (error) return <p className="py-3 text-xs text-red-300">{error}</p>
  if (!summary) return null

  const isToday = selectedDate === toLocalDateKey(new Date())
  const selectedDateLabel = dateOptions().find(o => o.value === selectedDate)?.label ?? selectedDate

  return (
    <div className="space-y-4 border-t border-white/10 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {isToday ? (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
              </span>
              Ao vivo — hoje
            </>
          ) : (
            <>
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-slate-600" />
              Resumo — {selectedDateLabel}
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <select
            value={selectedDate}
            onChange={e => handleDateChange(e.target.value)}
            className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300"
            style={{ background: '#111120' }}
          >
            {dateOptions().map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={() => void handleManualRefresh()}
            disabled={manualRefreshing}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30 transition-colors hover:bg-indigo-500/15 hover:text-indigo-100 disabled:opacity-60"
            style={{ background: 'rgba(99,102,241,0.1)' }}
          >
            {manualRefreshing ? <Spinner size={13} /> : <RefreshCw size={13} />}
            {manualRefreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {EVENT_TYPES.map(ev => (
          <div key={ev} className="rounded-xl p-3 text-center ring-1 ring-white/10" style={{ background: '#111120' }}>
            <div className="text-lg">{EVENT_ICON[ev]}</div>
            <div className="text-lg font-bold text-slate-100">{summary.counts_today[ev] ?? 0}</div>
            <div className="text-[10px] text-slate-500">{ev}</div>
          </div>
        ))}
      </div>

      {(summary.vendas_trackeadas > 0 || summary.vendas_nao_trackeadas > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl p-3 text-center ring-1 ring-green-500/20" style={{ background: 'rgba(34,197,94,0.08)' }}>
            <div className="text-lg font-bold text-green-400">{summary.vendas_trackeadas}</div>
            <div className="text-[10px] text-green-300/70">Vendas trackeadas</div>
          </div>
          <div className="rounded-xl p-3 text-center ring-1 ring-amber-500/20" style={{ background: 'rgba(245,158,11,0.08)' }}>
            <div className="text-lg font-bold text-amber-400">{summary.vendas_nao_trackeadas}</div>
            <div className="text-[10px] text-amber-300/70" title="Venda registrada mas não enviada à Meta — filtrada pelo 'exigir -tracker no src' ou pela lista de produtos">
              Vendas não trackeadas
            </div>
          </div>
        </div>
      )}

      {summary.coverage_today.total > 0 && (
        <div className="space-y-2.5 rounded-xl p-3 ring-1 ring-white/10" style={{ background: '#111120' }}>
          <CoverageBar label="Eventos com fbp" pct={summary.coverage_today.with_fbp_pct} />
          <CoverageBar label="Eventos com fbc" pct={summary.coverage_today.with_fbc_pct} />
          <CoverageBar label="Purchase cruzado com sessão" pct={summary.coverage_today.purchase_session_matched_pct} />
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Eventos</p>
        <div className="space-y-2">
          {EVENT_TYPES.map(eventName => (
            <EventTypeSection
              key={eventName}
              eventName={eventName}
              countBadge={summary.counts_today[eventName] ?? 0}
              section={sections[eventName]}
              onToggle={() => toggleSection(eventName)}
              onLoadMore={() => loadMore(eventName)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
