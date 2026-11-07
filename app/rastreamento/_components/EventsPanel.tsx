'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ListTree } from 'lucide-react'
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

// Funil de baixo pra cima: Purchase (o que mais importa) primeiro, PageView
// (o topo do funil, o menos decisivo) por último.
const EVENT_TYPES: EventName[] = ['Purchase', 'InitiateCheckout', 'AddToCart', 'ViewContent', 'PageView']
const PAGE_SIZE = 50

const EVENT_LABEL: Record<string, string> = {
  PageView: 'Visitas',
  ViewContent: 'Rolaram a página',
  AddToCart: 'Clicaram em comprar',
  InitiateCheckout: 'Foram pro checkout',
  Purchase: 'Vendas',
}

const EVENT_ICON: Record<string, string> = {
  PageView: '👁️',
  ViewContent: '📄',
  AddToCart: '🛍️',
  InitiateCheckout: '🛒',
  Purchase: '💰',
}

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

// A Meta manda "NOME_DO_ANUNCIO|ID_DO_ANUNCIO" em utm_content (mesmo padrão de
// utm_campaign com nome+ID da campanha) — aqui só o nome interessa pro painel,
// o ID não ajuda quem tá lendo.
function adName(utmContent: string | null): string | null {
  if (!utmContent) return null
  const [name] = utmContent.split('|')
  return name.trim() || null
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
      {adName(e.utm_content) && (
        <div className="text-[11px]">
          <span className="text-slate-600">🎯 anúncio: </span>
          <span className="font-medium text-slate-300">{adName(e.utm_content)}</span>
        </div>
      )}
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
          {EVENT_LABEL[eventName] ?? eventName}
          <span className="text-[10.5px] font-normal text-slate-600">{eventName}</span>
          <span className="text-xs font-normal text-slate-500">({countBadge})</span>
          {section.loading && <Spinner size={12} />}
        </span>
        {section.open ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
      </button>
      {section.open && (
        <div className="border-t border-white/10">
          {/* Rolagem própria da seção (não da página) — senão uma seção com
              muitos eventos empurra as outras duas pra longe. Altura calculada
              pra caber uns 4 eventos (Purchase é o mais alto, com a linha de
              anúncio) antes de precisar rolar. */}
          <div className="max-h-[36rem] space-y-1.5 overflow-y-auto p-3">
            {section.error ? (
              <p className="text-xs text-red-300">{section.error}</p>
            ) : section.events === null ? null : section.events.length === 0 ? (
              <p className="text-xs text-slate-600">Nenhum evento nesse período.</p>
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

// Lista de eventos um por um, no período escolhido no topo do painel. Cada
// tipo abre numa seção com rolagem própria e "carregar mais".
export function EventExplorer({ installationId, start, end, counts, refreshTick }: {
  installationId: string
  start: string
  end: string
  counts: Record<string, number>
  refreshTick: number
}) {
  const [sections, setSections] = useState<Record<EventName, SectionState>>(makeInitialSections)
  const sectionsRef = useRef(sections)
  const aliveRef = useRef(true)

  useEffect(() => { sectionsRef.current = sections }, [sections])
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  // silent = atualização automática: não mostra carregando, só troca a lista.
  const fetchSection = useCallback(async (eventName: EventName, offset: number, append: boolean, limit: number = PAGE_SIZE, silent = false) => {
    if (!silent) setSections(prev => ({ ...prev, [eventName]: { ...prev[eventName], loading: !append, loadingMore: append, error: null } }))
    const params = new URLSearchParams({
      installation_id: installationId, event_name: eventName, start, end,
      limit: String(limit), offset: String(offset),
    })
    const res = await fetch(`/api/track/events/list?${params.toString()}`)
    const json = await res.json().catch(() => ({}))
    if (!aliveRef.current) return
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
  }, [installationId, start, end])

  // Painel ao vivo: a cada atualização do topo, refaz as seções abertas
  // mantendo o tanto que já estava carregado.
  useEffect(() => {
    if (refreshTick === 0) return
    EVENT_TYPES.forEach(ev => {
      const sec = sectionsRef.current[ev]
      if (sec.open) void fetchSection(ev, 0, false, sec.events?.length || PAGE_SIZE, true)
    })
  }, [refreshTick, fetchSection])

  function toggleSection(eventName: EventName) {
    const current = sections[eventName]
    const willOpen = !current.open
    setSections(prev => ({ ...prev, [eventName]: { ...prev[eventName], open: willOpen } }))
    if (willOpen && current.events === null) void fetchSection(eventName, 0, false)
  }

  function loadMore(eventName: EventName) {
    const current = sections[eventName]
    if (current.loadingMore || !current.hasMore) return
    void fetchSection(eventName, current.offset, true)
  }

  return (
    <div className="rounded-2xl border p-4 sm:p-5" style={{ background: '#151524', borderColor: 'rgba(255,255,255,0.07)' }}>
      <div className="mb-4 flex items-center gap-2">
        <ListTree size={14} className="text-indigo-400" />
        <h3 className="text-[13px] font-semibold text-slate-200">Eventos um por um</h3>
        <span className="text-[11px] text-slate-600">abra um tipo pra ver cada visita, clique e venda com origem, página e cidade</span>
      </div>
      <div className="space-y-2">
        {EVENT_TYPES.map(eventName => (
          <EventTypeSection
            key={eventName}
            eventName={eventName}
            countBadge={counts[eventName] ?? 0}
            section={sections[eventName]}
            onToggle={() => toggleSection(eventName)}
            onLoadMore={() => loadMore(eventName)}
          />
        ))}
      </div>
    </div>
  )
}
