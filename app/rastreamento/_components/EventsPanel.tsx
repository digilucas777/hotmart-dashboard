'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'

type Summary = {
  counts_24h: Record<string, number>
  coverage_24h: {
    total: number
    with_fbp_pct: number | null
    with_fbc_pct: number | null
    purchase_session_matched_pct: number | null
  }
  recent: { event_name: string; source: string; session_hit: boolean | null; received_at: string }[]
}

const EVENT_ICON: Record<string, string> = {
  PageView: '👁️',
  InitiateCheckout: '🛒',
  Purchase: '💰',
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'agora mesmo'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
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

export function EventsPanel({ installationId }: { installationId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/track/events/summary?installation_id=${installationId}`)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(json?.error || 'Não foi possível carregar os eventos.')
      setLoading(false)
      return
    }
    setSummary(json)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installationId])

  if (loading) return <div className="flex justify-center py-6"><Spinner size={18} /></div>
  if (error) return <p className="py-3 text-xs text-red-300">{error}</p>
  if (!summary) return null

  const eventTypes = ['PageView', 'InitiateCheckout', 'Purchase']

  return (
    <div className="space-y-4 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Últimas 24h</p>
        <button onClick={() => void load()} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300">
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
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Eventos recentes</p>
        {summary.recent.length === 0 ? (
          <p className="text-xs text-slate-600">Nenhum evento recebido ainda.</p>
        ) : (
          <div className="space-y-1">
            {summary.recent.map((e, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span>{EVENT_ICON[e.event_name] ?? '📍'}</span>
                  {e.event_name}
                  {e.event_name === 'Purchase' && (
                    <span className={e.session_hit ? 'text-green-400' : 'text-amber-400'}>
                      {e.session_hit ? '✅' : '⚠️'}
                    </span>
                  )}
                </span>
                <span className="text-slate-600">{relativeTime(e.received_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
