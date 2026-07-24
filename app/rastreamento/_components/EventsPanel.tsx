'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'

type RecentEvent = {
  event_name: string
  source: string
  session_hit: boolean | null
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
}

type Summary = {
  counts_24h: Record<string, number>
  coverage_24h: {
    total: number
    with_fbp_pct: number | null
    with_fbc_pct: number | null
    purchase_session_matched_pct: number | null
  }
  recent: RecentEvent[]
}

const EVENT_ICON: Record<string, string> = {
  PageView: '👁️',
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

function geoLabel(e: RecentEvent): string | null {
  const parts = [e.geo_city, e.geo_region, e.geo_country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

function originLabel(e: RecentEvent): { label: string; className: string } {
  if (e.fbc) return { label: '📱 Facebook Ads', className: 'text-blue-300' }
  if (e.utm_source) return { label: `🔗 ${e.utm_source}`, className: 'text-indigo-300' }
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
  const utmParts = [e.utm_medium, e.utm_campaign, e.utm_content, e.utm_term].filter(Boolean)

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
        </span>
        <span className="text-slate-600">{relativeTime(e.received_at)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span className={origin.className}>{origin.label}</span>
        {geo && <span>📍 {geo}</span>}
        {e.ip && <span className="font-mono">{e.ip}</span>}
        {e.session_id && <span className="font-mono text-slate-600">sid:{e.session_id.slice(0, 8)}</span>}
      </div>
      {(e.utm_source || utmParts.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
          {e.utm_source && <span>utm_source: <span className="text-slate-400">{e.utm_source}</span></span>}
          {e.utm_medium && <span>utm_medium: <span className="text-slate-400">{e.utm_medium}</span></span>}
          {e.utm_campaign && <span>utm_campaign: <span className="text-slate-400">{e.utm_campaign}</span></span>}
        </div>
      )}
    </div>
  )
}

export function EventsPanel({ installationId }: { installationId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isMountedRef = useRef(true)

  async function load(showSpinner: boolean) {
    if (showSpinner) setLoading(true)
    setError(null)
    const res = await fetch(`/api/track/events/summary?installation_id=${installationId}`)
    const json = await res.json().catch(() => ({}))
    if (!isMountedRef.current) return
    if (!res.ok) {
      setError(json?.error || 'Não foi possível carregar os eventos.')
      setLoading(false)
      return
    }
    setSummary(json)
    setLoading(false)
  }

  useEffect(() => {
    isMountedRef.current = true
    void load(true)
    // Painel "ao vivo": atualiza sozinho enquanto estiver aberto, sem precisar
    // clicar em Atualizar toda hora.
    const interval = setInterval(() => void load(false), REFRESH_INTERVAL_MS)
    return () => {
      isMountedRef.current = false
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installationId])

  if (loading) return <div className="flex justify-center py-6"><Spinner size={18} /></div>
  if (error) return <p className="py-3 text-xs text-red-300">{error}</p>
  if (!summary) return null

  const eventTypes = ['PageView', 'InitiateCheckout', 'Purchase']

  return (
    <div className="space-y-4 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
          </span>
          Ao vivo — últimas 24h
        </p>
        <button onClick={() => void load(true)} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300">
          <RefreshCw size={11} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {eventTypes.map(ev => (
          <div key={ev} className="rounded-xl p-3 text-center ring-1 ring-white/10" style={{ background: '#111120' }}>
            <div className="text-lg">{EVENT_ICON[ev]}</div>
            <div className="text-lg font-bold text-slate-100">{summary.counts_24h[ev] ?? 0}</div>
            <div className="text-[10px] text-slate-500">{ev}</div>
          </div>
        ))}
      </div>

      {summary.coverage_24h.total > 0 && (
        <div className="space-y-2.5 rounded-xl p-3 ring-1 ring-white/10" style={{ background: '#111120' }}>
          <CoverageBar label="Eventos com fbp" pct={summary.coverage_24h.with_fbp_pct} />
          <CoverageBar label="Eventos com fbc" pct={summary.coverage_24h.with_fbc_pct} />
          <CoverageBar label="Purchase cruzado com sessão" pct={summary.coverage_24h.purchase_session_matched_pct} />
        </div>
      )}

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Eventos recentes, por visitante</p>
        {summary.recent.length === 0 ? (
          <p className="text-xs text-slate-600">Nenhum evento recebido ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {summary.recent.map((e, i) => <EventRow key={i} e={e} />)}
          </div>
        )}
      </div>
    </div>
  )
}
