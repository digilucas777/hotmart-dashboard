'use client'

import { useEffect, useState } from 'react'
import { Eye, ShoppingCart, ShoppingBag } from 'lucide-react'

type Atividade = { event_name: string; received_at: string; geo_country: string | null; geo_city: string | null; utm_content: string | null; utm_term: string | null }
type Venda = { received_at: string; pais: string | null; valor: string | null; moeda: string | null; produto: string | null; utm_content: string | null }
type Live = { agora: number; atividade: Atividade[]; vendas: Venda[] }

const ATUALIZA_MS = 15_000

function relativo(iso: string, agora: number) {
  const s = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'agora mesmo'
  const m = Math.floor(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}
function dinheiro(v: string | null, moeda: string | null) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(n) } catch { return `${moeda ?? ''} ${n.toFixed(2)}` }
}
const semId = (s: string | null) => (s ? s.split('|')[0].trim() || null : null)
const EVENTO: Record<string, { label: string; cor: string; icone: React.ReactNode }> = {
  PageView: { label: 'Visitou a página', cor: '#94a3b8', icone: <Eye size={12} /> },
  InitiateCheckout: { label: 'Foi pro checkout', cor: '#c084fc', icone: <ShoppingCart size={12} /> },
  Purchase: { label: 'Comprou', cor: '#4ade80', icone: <ShoppingBag size={12} /> },
}

// Coluna lateral "Ao vivo", igual à da dashboard: visitantes agora, últimas
// vendas e atividade recente (sem robôs). Atualiza sozinha a cada 15 s.
export function LiveSidebar({ installationId }: { installationId: string }) {
  const [d, setD] = useState<Live | null>(null)
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    let vivo = true
    const carregar = () => fetch(`/api/track/events/live?installation_id=${installationId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (vivo && j) { setD(j as Live); setAgora(Date.now()) } })
      .catch(() => {})
    carregar()
    const t = setInterval(carregar, ATUALIZA_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [installationId])

  const ultima = d?.vendas[0]

  return (
    <aside className="space-y-3 rounded-2xl border p-3" style={{ background: '#151524', borderColor: 'rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05] px-2.5 py-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-45" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">Ao vivo</p>
          <p className="truncate text-[11px] text-slate-500">{ultima ? `Última venda ${relativo(ultima.received_at, agora)}` : 'Aguardando vendas'}</p>
        </div>
      </div>

      <div className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Visitantes agora</p>
        <p className="text-2xl font-bold tabular-nums text-slate-50">{d ? d.agora.toLocaleString('pt-BR') : '-'}</p>
        <p className="text-[10.5px] text-slate-600">no site nos últimos 5 minutos</p>
      </div>

      <div>
        <h3 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Últimas vendas</h3>
        <div className="max-h-[300px] space-y-1 overflow-y-auto pr-0.5">
          {!d || d.vendas.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-600">Aguardando vendas</p>
          ) : d.vendas.map((v, i) => (
            <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2 py-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="truncate text-[11px] font-semibold text-emerald-300">{dinheiro(v.valor, v.moeda)}</span>
                <span className="shrink-0 font-mono text-[9.5px] text-slate-500">{v.pais ?? '??'}</span>
              </div>
              <p className="truncate text-[10.5px] text-slate-400" title={v.produto ?? ''}>{v.produto ?? 'Produto'}</p>
              <p className="flex justify-between gap-1 text-[10px] text-slate-600">
                <span className="truncate" title={semId(v.utm_content) ?? ''}>{semId(v.utm_content) ?? 'sem anúncio'}</span>
                <span className="shrink-0">{relativo(v.received_at, agora)}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/[0.06] pt-2.5">
        <h3 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">Atividade recente</h3>
        <div className="max-h-[420px] space-y-1 overflow-y-auto pr-0.5">
          {!d || d.atividade.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-600">Sem atividade nos últimos 3 dias</p>
          ) : d.atividade.map((a, i) => {
            const ev = EVENTO[a.event_name] ?? { label: a.event_name, cor: '#94a3b8', icone: <Eye size={12} /> }
            const local = [a.geo_city, a.geo_country].filter(Boolean).join(', ')
            return (
              <div key={i} className="flex gap-2 rounded-lg px-1.5 py-1 hover:bg-white/[0.03]">
                <span className="mt-0.5 shrink-0" style={{ color: ev.cor }}>{ev.icone}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium" style={{ color: ev.cor }}>{ev.label}</p>
                  <p className="truncate text-[10px] text-slate-500" title={local}>{local || 'local desconhecido'}{semId(a.utm_content) ? ` · ${semId(a.utm_content)}` : ''}</p>
                </div>
                <span className="shrink-0 text-[10px] text-slate-600">{relativo(a.received_at, agora)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
