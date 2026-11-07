'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Users, Copy, Check } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'

type Lead = {
  lead: string
  primeiro: string
  ultimo: string
  status: Status
  paginas: number
  utm_source: string | null
  utm_term: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  src: string | null
  com_fbc: boolean
  cidade: string | null
  pais: string | null
  pagina: string | null
  enviada_fb: boolean | null
  nome: string | null
  email: string | null
  telefone: string | null
  produto: string | null
  valor: string | null
  moeda: string | null
}
type Status = 'comprou' | 'abandonou' | 'carrinho' | 'engajou' | 'visitou'
type Resposta = { contagem: Partial<Record<Status, number>> | null; total: number; leads: Lead[] }

// Status do lead = a etapa mais avançada que ele chegou.
const STATUS: { id: Status; label: string; ev: string; cor: string; fundo: string; borda: string }[] = [
  { id: 'comprou', label: 'Compra aprovada', ev: 'Purchase', cor: '#4ade80', fundo: 'rgba(34,197,94,0.12)', borda: 'rgba(34,197,94,0.35)' },
  { id: 'abandonou', label: 'Abandono de checkout', ev: 'InitiateCheckout', cor: '#fbbf24', fundo: 'rgba(245,158,11,0.12)', borda: 'rgba(245,158,11,0.35)' },
  { id: 'carrinho', label: 'Adicionou ao carrinho', ev: 'AddToCart', cor: '#fb923c', fundo: 'rgba(249,115,22,0.12)', borda: 'rgba(249,115,22,0.35)' },
  { id: 'engajou', label: 'Viu a página', ev: 'ViewContent', cor: '#60a5fa', fundo: 'rgba(59,130,246,0.12)', borda: 'rgba(59,130,246,0.3)' },
  { id: 'visitou', label: 'Só visitou', ev: 'PageView', cor: '#94a3b8', fundo: 'rgba(148,163,184,0.10)', borda: 'rgba(148,163,184,0.25)' },
]
const STATUS_MAP = new Map(STATUS.map(s => [s.id, s]))
const POR_PAGINA = 50

const semId = (s: string | null) => (s ? s.split('|')[0].trim() || null : null)

function dataHora(iso: string) {
  const d = new Date(iso)
  return {
    data: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }),
    hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }
}
function dinheiro(v: string | null, moeda: string | null) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(n) } catch { return `${moeda ?? ''} ${n.toFixed(2)}` }
}
function nomePais(iso: string | null) {
  if (!iso) return null
  try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(iso.toUpperCase()) ?? iso } catch { return iso }
}
function caminho(url: string | null) {
  if (!url) return null
  try { return new URL(url).pathname } catch { return null }
}

// Plataforma pelo posicionamento que a Meta manda no utm_term
// (Facebook_Mobile_Reels, Instagram_Stories, an = Audience Network...).
function plataforma(l: Lead): { tipo: 'fb' | 'ig' | 'outro' | 'direto'; label: string } {
  const t = (l.utm_term ?? '').toLowerCase()
  const s = (l.utm_source ?? '').toLowerCase()
  const pos = l.utm_term
    ? l.utm_term === 'an' ? 'Audience Network' : l.utm_term === 'Others' ? 'Outros posicionamentos' : l.utm_term.replace(/_/g, ' ').trim()
    : null
  if (t.startsWith('instagram') || s === 'ig' || s === 'instagram') return { tipo: 'ig', label: pos ?? 'Instagram' }
  if (t.startsWith('facebook') || t.startsWith('messenger') || t === 'an' || t === 'others' || s === 'facebook' || s === 'fb' || l.com_fbc) {
    return { tipo: 'fb', label: pos ?? 'Facebook' }
  }
  if (l.utm_source) return { tipo: 'outro', label: l.utm_source }
  if (l.src) return { tipo: 'outro', label: `src: ${l.src}` }
  return { tipo: 'direto', label: 'Direto / sem UTM' }
}

function IconeFacebook() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-label="Facebook" role="img">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path d="M13.4 19.5v-6.1h2.05l.31-2.38H13.4V9.5c0-.69.19-1.16 1.18-1.16h1.26V6.21a17 17 0 0 0-1.84-.09c-1.82 0-3.07 1.11-3.07 3.15v1.76H8.87v2.38h2.06v6.1z" fill="#fff" />
    </svg>
  )
}
function IconeInstagram() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-label="Instagram" role="img">
      <defs>
        <radialGradient id="igrad" cx="30%" cy="107%" r="150%">
          <stop offset="0" stopColor="#fdf497" /><stop offset=".05" stopColor="#fdf497" />
          <stop offset=".45" stopColor="#fd5949" /><stop offset=".6" stopColor="#d6249f" /><stop offset=".9" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="6.5" fill="url(#igrad)" />
      <rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="16.1" cy="7.9" r="0.95" fill="#fff" />
    </svg>
  )
}
function IconePlataforma({ tipo }: { tipo: 'fb' | 'ig' | 'outro' | 'direto' }) {
  if (tipo === 'fb') return <IconeFacebook />
  if (tipo === 'ig') return <IconeInstagram />
  return (
    <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-bold text-slate-400" style={{ background: 'rgba(255,255,255,0.08)' }}>
      {tipo === 'direto' ? '↗' : '#'}
    </span>
  )
}

function Copiavel({ texto, className = '' }: { texto: string; className?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1500) } catch { /* sem permissão: o texto continua selecionável */ }
      }}
      className={`group flex max-w-full items-center gap-1 text-left hover:text-slate-100 ${className}`}
      title="Clique pra copiar"
    >
      <span className="truncate">{texto}</span>
      {ok ? <Check size={11} className="shrink-0 text-emerald-400" /> : <Copy size={11} className="shrink-0 opacity-0 group-hover:opacity-60" />}
    </button>
  )
}

export function LeadsTable({ installationId, start, end, refreshTick }: {
  installationId: string
  start: string
  end: string
  refreshTick: number
}) {
  const [status, setStatus] = useState<Status | null>(null)
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [dados, setDados] = useState<Resposta | null>(null)
  const [chaveCarregada, setChaveCarregada] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [maisCarregando, setMaisCarregando] = useState(false)
  const pedido = useRef(0)
  const qtdRef = useRef(POR_PAGINA)

  const chave = `${installationId}|${start}|${end}|${status ?? ''}|${buscaAplicada}`
  const carregando = chaveCarregada !== chave

  // Espera a pessoa parar de digitar pra buscar.
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 400)
    return () => clearTimeout(t)
  }, [busca])

  const buscar = useCallback(async (offset: number, limit: number, acrescentar: boolean) => {
    const id = ++pedido.current
    const q = new URLSearchParams({ installation_id: installationId, start, end, limit: String(limit), offset: String(offset) })
    if (status) q.set('status', status)
    if (buscaAplicada) q.set('busca', buscaAplicada)
    try {
      const res = await fetch(`/api/track/events/leads?${q}`)
      const json = await res.json().catch(() => ({}))
      if (id !== pedido.current) return
      if (!res.ok) { setErro(json?.error || 'Não foi possível carregar os leads.'); return }
      setErro(null)
      const r = json as Resposta
      setDados(prev => (acrescentar && prev ? { ...r, leads: [...prev.leads, ...r.leads] } : r))
      if (!acrescentar) qtdRef.current = Math.max(limit, POR_PAGINA)
      else qtdRef.current = offset + r.leads.length
    } catch {
      if (id === pedido.current) setErro('Sem conexão. Tente de novo em instantes.')
    } finally {
      if (id === pedido.current) { setChaveCarregada(chave); setMaisCarregando(false) }
    }
  }, [installationId, start, end, status, buscaAplicada, chave])

  useEffect(() => {
    // buscar só mexe no estado depois do fetch responder
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscar(0, POR_PAGINA, false)
  }, [buscar])

  // Ao vivo: refaz a lista mantendo o tanto que já estava aberto.
  useEffect(() => {
    if (refreshTick === 0) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void buscar(0, Math.min(qtdRef.current, 200), false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick])

  function carregarMais() {
    if (!dados) return
    setMaisCarregando(true)
    void buscar(dados.leads.length, POR_PAGINA, true)
  }

  const contagem = dados?.contagem ?? {}
  const totalGeral = STATUS.reduce((a, s) => a + (contagem[s.id] ?? 0), 0)
  const leads = dados?.leads ?? []

  return (
    <div className="min-w-0 rounded-2xl border" style={{ background: '#151524', borderColor: 'rgba(255,255,255,0.07)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-100">Leads</h3>
          <span className="text-[11px] text-slate-500">{totalGeral.toLocaleString('pt-BR')} no período</span>
          {carregando && dados && <Spinner size={12} />}
        </div>
        <label className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 ring-1 ring-white/10 focus-within:ring-indigo-500/50 sm:w-72" style={{ background: 'rgba(0,0,0,0.2)' }}>
          <Search size={13} className="shrink-0 text-slate-500" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar nome, e-mail, campanha, anúncio..."
            className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 placeholder-slate-600 outline-none"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 pb-3 sm:px-5">
        <button
          onClick={() => setStatus(null)}
          className={`rounded-full px-3 py-1 text-[11px] font-semibold ring-1 transition-colors ${status === null ? 'bg-indigo-500 text-white ring-indigo-500' : 'text-slate-400 ring-white/10 hover:text-slate-200'}`}
        >
          Todos <span className="opacity-70">{totalGeral.toLocaleString('pt-BR')}</span>
        </button>
        {STATUS.map(s => (
          <button
            key={s.id}
            onClick={() => setStatus(prev => (prev === s.id ? null : s.id))}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors"
            style={status === s.id
              ? { background: s.fundo, color: s.cor, boxShadow: `inset 0 0 0 1px ${s.borda}` }
              : { color: '#94a3b8', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)' }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.cor }} />
            {s.label}
            <span className="opacity-70">{(contagem[s.id] ?? 0).toLocaleString('pt-BR')}</span>
          </button>
        ))}
      </div>

      {erro && <p className="px-5 pb-4 text-xs text-rose-300">{erro}</p>}

      <div className="max-h-[640px] overflow-auto border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <table className="w-full min-w-[1080px] text-left text-xs">
          <thead className="sticky top-0 z-10" style={{ background: '#151524' }}>
            <tr className="text-[10.5px] uppercase tracking-wider text-slate-500">
              <th className="py-2.5 pl-4 pr-2 font-medium sm:pl-5">Data e hora</th>
              <th className="px-2 py-2.5 font-medium">Plataforma</th>
              <th className="px-2 py-2.5 font-medium">Lead</th>
              <th className="px-2 py-2.5 font-medium">Campanha</th>
              <th className="px-2 py-2.5 font-medium">Anúncio</th>
              <th className="px-2 py-2.5 font-medium">Status</th>
              <th className="py-2.5 pl-2 pr-4 text-right font-medium sm:pr-5">Valor</th>
            </tr>
          </thead>
          <tbody>
            {!dados && carregando ? (
              <tr><td colSpan={7} className="py-16 text-center"><Spinner size={20} /></td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={7} className="py-14 text-center text-sm text-slate-600">Nenhum lead {status ? 'com esse status ' : ''}nesse período.</td></tr>
            ) : leads.map(l => {
              const st = STATUS_MAP.get(l.status) ?? STATUS[4]
              const pl = plataforma(l)
              const dh = dataHora(l.ultimo)
              const camp = semId(l.utm_campaign)
              const conj = semId(l.utm_medium)
              const ad = semId(l.utm_content)
              const local = [l.cidade, nomePais(l.pais)].filter(Boolean).join(', ')
              const valor = l.status === 'comprou' ? dinheiro(l.valor, l.moeda) : null
              return (
                <tr key={l.lead} className="border-t transition-colors hover:bg-white/[0.02]" style={{ borderColor: 'rgba(255,255,255,0.05)', boxShadow: `inset 3px 0 0 ${st.cor}` }}>
                  <td className="whitespace-nowrap py-3 pl-4 pr-2 align-top sm:pl-5">
                    <p className="tabular-nums text-slate-200">{dh.data}</p>
                    <p className="tabular-nums text-[11px] text-slate-500">{dh.hora}</p>
                  </td>
                  <td className="px-2 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <IconePlataforma tipo={pl.tipo} />
                      <span className="max-w-[120px] truncate text-[11px] text-slate-400" title={pl.label}>{pl.label}</span>
                    </div>
                  </td>
                  <td className="max-w-[240px] px-2 py-3 align-top">
                    {l.nome || l.email ? (
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate font-semibold text-slate-100" title={l.nome ?? ''}>{l.nome ?? 'Sem nome'}</p>
                        {l.email && <Copiavel texto={l.email} className="text-[11px] text-slate-400" />}
                        {l.telefone && <Copiavel texto={l.telefone} className="text-[11px] tabular-nums text-slate-400" />}
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <p className="text-slate-500">Visitante anônimo</p>
                        <p className="truncate text-[11px] text-slate-600" title={local}>{local || 'local desconhecido'}</p>
                      </div>
                    )}
                    {(l.nome || l.email) && local && <p className="truncate text-[10.5px] text-slate-600">{local}</p>}
                  </td>
                  <td className="max-w-[260px] px-2 py-3 align-top">
                    {camp ? (
                      <>
                        <p className="truncate text-slate-200" title={camp}>{camp}</p>
                        {conj && <p className="truncate text-[11px] text-slate-500" title={conj}>{conj}</p>}
                      </>
                    ) : (
                      <p className="text-slate-600">{l.src ? `src: ${l.src}` : 'Sem UTM'}</p>
                    )}
                  </td>
                  <td className="max-w-[200px] px-2 py-3 align-top">
                    {ad ? <p className="truncate text-slate-300" title={ad}>{ad}</p> : <p className="text-slate-600">-</p>}
                    {caminho(l.pagina) && <p className="truncate text-[10.5px] text-slate-600" title={l.pagina ?? ''}>{caminho(l.pagina)}</p>}
                  </td>
                  <td className="px-2 py-3 align-top">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: st.fundo, color: st.cor, boxShadow: `inset 0 0 0 1px ${st.borda}` }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.cor }} />
                      {st.label}
                    </span>
                    <p className="mt-1 text-[10.5px] text-slate-600">
                      {st.ev}
                      {l.status === 'comprou' && (l.enviada_fb ? ' · enviada ao Facebook' : ' · não enviada ao Facebook')}
                    </p>
                  </td>
                  <td className="whitespace-nowrap py-3 pl-2 pr-4 text-right align-top sm:pr-5">
                    {valor ? (
                      <>
                        <p className="font-bold tabular-nums text-emerald-300">{valor}</p>
                        {l.produto && <p className="ml-auto max-w-[160px] truncate text-[10.5px] text-slate-500" title={l.produto}>{l.produto}</p>}
                      </>
                    ) : <span className="text-slate-700">-</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {dados && leads.length < (dados.total ?? 0) && (
        <div className="flex items-center justify-center gap-3 border-t p-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <span className="text-[11px] text-slate-600">mostrando {leads.length.toLocaleString('pt-BR')} de {dados.total.toLocaleString('pt-BR')}</span>
          <button onClick={carregarMais} disabled={maisCarregando} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-500/15 disabled:opacity-60">
            {maisCarregando && <Spinner size={11} />}
            Carregar mais
          </button>
        </div>
      )}
      <p className="border-t px-4 py-2.5 text-[10.5px] leading-snug text-slate-600 sm:px-5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        Nome, e-mail e telefone aparecem quando o lead compra (vêm do webhook da venda). O abandono que a Hotmart manda não traz o código da visita, então não dá pra ligar o nome dele a esta lista.
      </p>
    </div>
  )
}
