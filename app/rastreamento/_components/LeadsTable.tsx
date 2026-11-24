'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Search, Users, Copy, Check, ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'
import { Spinner } from '@/components/ui/Spinner'

type Lead = {
  lead: string
  primeiro: string
  ultimo: string
  status: Status
  paginas: number
  paginas_lista?: string[] // páginas abertas (sem UTMs), na ordem da primeira visita
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
  dados_abandono?: boolean
  // cada compra do lead (principal, order bump, upsell) com o seu próprio envio à Meta
  recuperada?: boolean
  compras?: { produto: string | null; valor: string | null; moeda: string | null; enviada: boolean }[]
}
type Status = 'comprou' | 'checkout' | 'abandonou' | 'carrinho' | 'engajou' | 'visitou'
type Resposta = { contagem: Partial<Record<Status, number>> | null; total: number; leads: Lead[] }

// Status do lead = a etapa mais avançada que ele chegou. Checkout sem compra
// só vira abandono de carrinho quando a Hotmart avisa (webhook); senão fica InitiateCheckout.
const STATUS: { id: Status; label: string; ev: string; cor: string; fundo: string; borda: string }[] = [
  { id: 'comprou', label: 'Compra aprovada', ev: 'Purchase', cor: '#4ade80', fundo: 'rgba(34,197,94,0.12)', borda: 'rgba(34,197,94,0.35)' },
  { id: 'checkout', label: 'InitiateCheckout', ev: '', cor: '#c084fc', fundo: 'rgba(168,85,247,0.12)', borda: 'rgba(168,85,247,0.35)' },
  { id: 'abandonou', label: 'Abandono de carrinho', ev: 'avisado pela plataforma', cor: '#fbbf24', fundo: 'rgba(245,158,11,0.12)', borda: 'rgba(245,158,11,0.35)' },
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
// Lead que comprou vários produtos: a célula mostra só o principal (o que vai à
// Meta) e um "+N produtos"; ao abrir, uma faixa embaixo da linha mostra cada
// compra num cartão (3 por linha) com horário, src e parâmetros.
type Compra = {
  produto: string | null; valor: string | null; moeda: string | null; enviada: boolean; reembolsada?: boolean
  t?: string | null; src?: string | null; utm_source?: string | null; utm_campaign?: string | null
  utm_medium?: string | null; utm_content?: string | null; utm_term?: string | null
}
function totalCompras(compras: Compra[]) {
  if (new Set(compras.map(c => c.moeda ?? '')).size !== 1) return null
  return dinheiro(String(compras.reduce((t, c) => t + (Number(c.valor) || 0), 0)), compras[0].moeda)
}
function ResumoCompras({ compras, aberto, onToggle }: { compras: Compra[]; aberto: boolean; onToggle: () => void }) {
  const principal = compras.find(c => c.enviada) ?? compras[0]
  const total = totalCompras(compras)
  return (
    <div className="min-w-0">
      <p className="truncate font-bold tabular-nums text-emerald-300">{dinheiro(principal.valor, principal.moeda) ?? '-'}</p>
      {principal.produto && <p className="truncate text-[10px] text-slate-500" title={principal.produto}>{principal.produto}</p>}
      <button type="button" onClick={onToggle} className="mt-0.5 inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-semibold text-indigo-300 hover:underline" title={aberto ? 'Fechar detalhes' : 'Ver cada produto comprado'}>
        {aberto ? 'fechar' : `+${compras.length - 1} produto${compras.length > 2 ? 's' : ''}`}
        <ChevronDown className={`h-3 w-3 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {total && <p className="text-[9.5px] tabular-nums text-emerald-500/70">total {total}</p>}
    </div>
  )
}
function CartaoCompra({ c, n }: { c: Compra; n: number }) {
  const dh = c.t ? dataHora(c.t) : null
  const linhas: [string, string | null][] = [
    ['campanha', semId(c.utm_campaign ?? null)], ['conjunto', semId(c.utm_medium ?? null)],
    ['anúncio', semId(c.utm_content ?? null)], ['posição', c.utm_term ?? null],
  ]
  return (
    <div className="min-w-0 rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.03)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate font-bold tabular-nums text-emerald-300">{dinheiro(c.valor, c.moeda) ?? '-'}</p>
        <span className="shrink-0 text-[9.5px] tabular-nums text-slate-600">#{n}{dh ? ` · ${dh.data} ${dh.hora}` : ''}</span>
      </div>
      <p className="truncate text-[11px] font-medium text-slate-100" title={c.produto ?? ''}>{c.produto ?? 'Produto sem nome'}</p>
      <p className={`truncate text-[9.5px] ${c.enviada ? 'text-emerald-500/80' : 'text-amber-400/80'}`} title={c.enviada ? 'Purchase enviado à Meta' : 'Fora da lista de produtos enviados à Meta (order bump/upsell)'}>
        {c.enviada ? '✓ enviada à Meta (principal)' : 'não vai à Meta (order bump/upsell)'}
      </p>
      <div className="mt-1.5 space-y-0.5 border-t pt-1.5 text-[10px]" style={{ borderColor: 'rgba(127,127,127,0.15)' }}>
        <p className="flex min-w-0 gap-1"><span className="w-14 shrink-0 text-slate-600">src</span><Param valor={c.src ?? null} className="font-mono text-teal-300" /></p>
        {linhas.map(([k, v]) => (
          <p key={k} className="flex min-w-0 gap-1"><span className="w-14 shrink-0 text-slate-600">{k}</span><Param valor={v} className="text-slate-400" /></p>
        ))}
      </div>
    </div>
  )
}
function FaixaCompras({ compras, cor }: { compras: Compra[]; cor: string }) {
  return (
    <tr className="border-t" style={{ borderColor: 'rgba(255,255,255,0.05)', boxShadow: `inset 3px 0 0 ${cor}` }}>
      <td colSpan={10} className="px-3 pb-3 pt-2 sm:px-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {compras.map((c, i) => <CartaoCompra key={i} c={c} n={i + 1} />)}
        </div>
      </td>
    </tr>
  )
}
function nomePais(iso: string | null) {
  if (!iso) return null
  try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(iso.toUpperCase()) ?? iso } catch { return iso }
}
// Domínio + caminho da primeira página que o lead abriu (sem as UTMs).
function pagina(url: string | null) {
  if (!url) return null
  try { const u = new URL(url); return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}` } catch { return null }
}

// utm_term = {{placement}} da Meta: onde o anúncio apareceu quando a pessoa
// clicou (Instagram_Stories, Facebook_Mobile_Reels, an = Audience Network...).
function posicionamento(term: string | null, source: string | null): { tipo: 'fb' | 'ig' | 'outro' | 'direto'; label: string } | null {
  const t = (term ?? '').trim()
  const s = (source ?? '').toLowerCase()
  if (!t) {
    if (s === 'ig' || s === 'instagram') return { tipo: 'ig', label: 'Instagram' }
    if (s === 'fb' || s === 'facebook') return null
    return null
  }
  const low = t.toLowerCase()
  const label = low === 'an' ? 'Audience Network' : low === 'others' ? 'Outros posicionamentos' : t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  if (low.startsWith('instagram') || low === 'ig') return { tipo: 'ig', label: low === 'ig' ? 'Instagram' : label }
  if (low.startsWith('facebook') || low.startsWith('messenger') || low === 'an' || low === 'others' || low === 'fb') return { tipo: 'fb', label: low === 'fb' ? 'Facebook' : label }
  return { tipo: 'outro', label }
}

function Th({ children, param, className = '' }: { children: React.ReactNode; param?: string; className?: string }) {
  return (
    <th className={`truncate px-1.5 py-2.5 align-bottom font-medium ${className}`}>
      <span className="block">{children}</span>
      {param && <span className="block truncate font-mono text-[9px] normal-case tracking-normal text-slate-600">{param}</span>}
    </th>
  )
}

// Parâmetro (campanha, conjunto, anúncio, src...): na tabela fica cortado,
// mas ao passar o mouse abre um balão com o valor completo e botão copiar.
// O balão é "fixed" pra não ser cortado pela rolagem da tabela.
function BotaoCopiar({ texto, visivel }: { texto: string; visivel?: boolean }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      title="Copiar"
      aria-label="Copiar"
      onClick={async e => {
        e.stopPropagation()
        try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1500) } catch { /* sem permissão: o texto continua selecionável */ }
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded p-0.5 transition-opacity hover:bg-white/10 ${visivel || ok ? 'opacity-80' : 'opacity-0 group-hover/p:opacity-60'}`}
    >
      {ok ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
    </button>
  )
}
function Param({ valor, bruto, href, className = '' }: { valor: string | null; bruto?: string | null; href?: string | null; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number; cima: boolean; alvo: HTMLElement } | null>(null)
  useEffect(() => {
    if (!pos) return
    const fechar = () => setPos(null)
    window.addEventListener('scroll', fechar, true)
    return () => window.removeEventListener('scroll', fechar, true)
  }, [pos])
  if (!valor) return <span className="text-slate-600">-</span>
  const abrir = () => {
    if (timer.current) clearTimeout(timer.current)
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const cima = r.bottom + 120 > window.innerHeight
    // balão vai pra raiz do painel (fora do card arrastável, que desloca o 'fixed'), mantendo as cores do tema
    const alvo = (ref.current?.closest('.ts-app') as HTMLElement | null) ?? document.body
    setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - 348)), y: cima ? r.top - 4 : r.bottom + 4, cima, alvo })
  }
  const sair = () => { timer.current = setTimeout(() => setPos(null), 180) }
  // nome "Campanha X|123456": o ID também fica disponível pra copiar
  const id = bruto && bruto.includes('|') ? bruto.split('|').slice(1).join('|').trim() || null : null
  return (
    <span ref={ref} className="group/p flex min-w-0 items-center gap-0.5" onMouseEnter={abrir} onMouseLeave={sair}>
      {href
        ? <a href={href} target="_blank" rel="noreferrer" className={`truncate hover:underline ${className}`}>{valor}</a>
        : <span className={`truncate ${className}`}>{valor}</span>}
      <BotaoCopiar texto={href || valor} />
      {pos && createPortal(
        <span
          role="tooltip"
          onMouseEnter={abrir}
          onMouseLeave={sair}
          className="fixed z-[60] flex w-max max-w-[340px] flex-col gap-1.5 rounded-lg px-2.5 py-2 text-left text-[11px] font-normal leading-snug shadow-xl"
          style={{ left: pos.x, top: pos.y, transform: pos.cima ? 'translateY(-100%)' : undefined, ...({ background: '#0b1220', border: '1px solid rgba(255,255,255,0.14)', color: '#e2e8f0' }) }}
        >
          <span className="flex items-start gap-1.5"><span className="break-all">{href || valor}</span><BotaoCopiar texto={href || valor} visivel /></span>
          {id && <span className="flex items-center gap-1.5 opacity-70"><span className="break-all font-mono text-[10px]">ID {id}</span><BotaoCopiar texto={id} visivel /></span>}
        </span>,
        pos.alvo,
      )}
    </span>
  )
}

function Celula({ valor, bruto, destaque }: { valor: string | null; bruto?: string | null; destaque?: boolean }) {
  return <Param valor={valor} bruto={bruto} className={destaque ? 'font-medium text-slate-100' : 'text-slate-300'} />
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
  // relógio pra marcar 'agora' (menos de 2 min) ao vivo, sem esperar recarregar
  const [agoraMs, setAgoraMs] = useState(() => Date.now())
  useEffect(() => { const t = window.setInterval(() => setAgoraMs(Date.now()), 15_000); return () => window.clearInterval(t) }, [])

  const [status, setStatus] = useState<Status | null>(null)
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [dados, setDados] = useState<Resposta | null>(null)
  const [chaveCarregada, setChaveCarregada] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [maisCarregando, setMaisCarregando] = useState(false)
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set())
  const alternar = (id: string) => setAbertos(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
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
            placeholder="Buscar nome, e-mail, campanha, conjunto, anúncio..."
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
        {/* larguras fixas por coluna: cabe sem arrastar; texto longo corta com "..." e aparece inteiro no mouse */}
        <table className="w-full min-w-[1080px] table-fixed text-left text-xs">
          <colgroup>
            <col style={{ width: '7%' }} />
            <col style={{ width: '14.5%' }} />
            <col style={{ width: '12.5%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '8.5%' }} />
            <col style={{ width: '6.5%' }} />
            <col style={{ width: '7%' }} />
          </colgroup>
          <thead className="sticky top-0 z-10" style={{ background: '#151524' }}>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <Th className="pl-3 sm:pl-4">Data</Th>
              <Th>Lead</Th>
              <Th>Status</Th>
              <Th className="text-right">Valor</Th>
              <Th param="utm_source · utm_term">Origem</Th>
              <Th param="utm_campaign">Campanha</Th>
              <Th param="utm_medium">Conjunto</Th>
              <Th param="utm_content">Anúncio</Th>
              <Th param="src">Src</Th>
              <Th className="pr-3 sm:pr-4">Página</Th>
            </tr>
          </thead>
          <tbody>
            {!dados && carregando ? (
              <tr><td colSpan={10} className="py-16 text-center"><Spinner size={20} /></td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={10} className="py-14 text-center text-sm text-slate-600">Nenhum lead {status ? 'com esse status ' : ''}nesse período.</td></tr>
            ) : leads.map(l => {
              const st = STATUS_MAP.get(l.status) ?? STATUS[STATUS.length - 1]
              const pos = posicionamento(l.utm_term, l.utm_source)
              const dh = dataHora(l.ultimo)
              const aoVivo = agoraMs - new Date(l.ultimo).getTime() < 2 * 60_000
              const camp = semId(l.utm_campaign)
              const conj = semId(l.utm_medium)
              const ad = semId(l.utm_content)
              const primeira = l.paginas_lista?.[0] ?? l.pagina
              const pag = pagina(primeira)
              const local = [l.cidade, nomePais(l.pais)].filter(Boolean).join(', ')
              const valor = l.status === 'comprou' ? dinheiro(l.valor, l.moeda) : null
              const semUtm = !l.utm_source && !camp && !conj && !ad && !l.utm_term
              const multi = l.status === 'comprou' && (l.compras?.length ?? 0) > 1
              return (
                <Fragment key={l.lead}>
                <tr className="border-t transition-colors hover:bg-white/[0.02]" style={{ borderColor: 'rgba(255,255,255,0.05)', boxShadow: `inset 3px 0 0 ${st.cor}` }}>
                  <td className="py-2.5 pl-3 pr-1.5 align-top sm:pl-4">
                    <p className="tabular-nums text-slate-200">{dh.data}</p>
                    {aoVivo ? (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-400" title={`última atividade às ${dh.hora}`}>
                        <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" /></span>
                        agora
                      </p>
                    ) : (
                      <p className="tabular-nums text-[10.5px] text-slate-500">{dh.hora.slice(0, 5)}</p>
                    )}
                  </td>
                  <td className="px-1.5 py-2.5 align-top">
                    {l.nome || l.email ? (
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate font-semibold text-slate-100" title={l.nome ?? ''}>{l.nome ?? 'Sem nome'}</p>
                        {l.dados_abandono && (
                          <span className="inline-block max-w-full truncate rounded px-1.5 py-px text-[9px] font-semibold text-amber-300" style={{ background: 'rgba(245,158,11,0.12)' }} title="Dados do aviso de abandono de carrinho da Hotmart (chega 30 a 60 min depois), ligado a esta visita pelo produto, país e horário">
                            dados do abandono
                          </span>
                        )}
                        {l.email && <Copiavel texto={l.email} className="text-[10.5px] text-slate-400" />}
                        {l.telefone && <Copiavel texto={l.telefone} className="text-[10.5px] tabular-nums text-slate-400" />}
                      </div>
                    ) : (
                      <p className="text-slate-500">Visitante anônimo</p>
                    )}
                    {local && <p className="truncate text-[10px] text-slate-600" title={local}>{local}</p>}
                  </td>
                  <td className="px-1.5 py-2.5 align-top">
                    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: st.fundo, color: st.cor, boxShadow: `inset 0 0 0 1px ${st.borda}` }} title={st.label}>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: st.cor }} />
                      <span className="truncate">{st.label}</span>
                    </span>
                    {st.ev && <p className="mt-1 truncate text-[10px] text-slate-600" title={st.ev}>{st.ev}</p>}
                    {l.status === 'comprou' && (() => {
                      const cs = l.compras ?? []
                      if (cs.length > 1) {
                        const env = cs.filter(c => c.enviada).length
                        const cor = env === cs.length ? 'text-emerald-500/80' : env === 0 ? 'text-amber-400/80' : 'text-slate-400'
                        return <p className={`truncate text-[10px] ${cor}`}>{env === 0 ? 'nenhuma enviada à Meta' : `✓ ${env} de ${cs.length} enviada${env > 1 ? 's' : ''} à Meta`}</p>
                      }
                      const enviada = cs.length === 1 ? cs[0].enviada : l.enviada_fb
                      return <p className={`truncate text-[10px] ${enviada ? 'text-emerald-500/80' : 'text-amber-400/80'}`}>{enviada ? '✓ enviada à Meta' : 'não enviada à Meta'}</p>
                    })()}
                  </td>
                  <td className="px-1.5 py-2.5 text-right align-top">
                    {l.status === 'comprou' && (l.compras?.length ?? 0) > 1 ? (
                      <ResumoCompras compras={l.compras!} aberto={abertos.has(l.lead)} onToggle={() => alternar(l.lead)} />
                    ) : valor ? (
                      <>
                        <p className="truncate font-bold tabular-nums text-emerald-300">{valor}</p>
                        {l.produto && <p className="truncate text-[10px] text-slate-500" title={l.produto}>{l.produto}</p>}
                      </>
                    ) : <span className="text-slate-700">-</span>}
                  </td>
                  <td className="px-1.5 py-2.5 align-top">
                    {l.utm_source
                      ? <p className="truncate text-[11px] font-medium text-slate-200" title={l.utm_source}>{l.utm_source}</p>
                      : <p className="text-slate-600">{semUtm ? 'sem UTM' : '-'}</p>}
                    {l.recuperada && <span className="mt-0.5 inline-block rounded px-1.5 py-px text-[9px] font-semibold text-sky-300" style={{ background: 'rgba(56,189,248,0.12)' }} title="A página seguinte abriu sem UTM (ex: botão da pressel em código, cookies apagados no iPhone). A origem foi completada pela visita anterior do mesmo aparelho e internet, antes de mandar pra Meta.">origem recuperada</span>}
                    {pos && (
                      <div className="mt-0.5 flex min-w-0 items-center gap-1" title={l.utm_term ?? ''}>
                        <span className="shrink-0 scale-[0.8]"><IconePlataforma tipo={pos.tipo} /></span>
                        <Param valor={pos.label} className="text-[10.5px] text-slate-400" />
                      </div>
                    )}
                  </td>
                  <td className="px-1.5 py-2.5 align-top"><Celula valor={camp} bruto={l.utm_campaign} destaque /></td>
                  <td className="px-1.5 py-2.5 align-top"><Celula valor={conj} bruto={l.utm_medium} /></td>
                  <td className="px-1.5 py-2.5 align-top"><Celula valor={ad} bruto={l.utm_content} destaque /></td>
                  <td className="px-1.5 py-2.5 align-top">
                    <Param valor={l.src} className="font-mono text-[10.5px] text-teal-300" />
                  </td>
                  <td className="py-2.5 pl-1.5 pr-3 align-top sm:pr-4">
                    {pag ? (
                      <Param valor={pag.replace(/^[^/]+/, '') || pag} href={primeira} className="text-[11px] text-indigo-300" />
                    ) : <p className="text-slate-600">-</p>}
                    {(() => {
                      // demais páginas que o lead abriu, além da primeira
                      const outras = (l.paginas_lista ?? []).slice(1)
                      if (outras.length === 0) return l.paginas > 1 ? <p className="truncate text-[10px] text-slate-600">{l.paginas} visualizações</p> : null
                      return <>
                        {outras.map(u => <Param key={u} valor={(pagina(u) ?? u).replace(/^[^/]+/, '') || u} href={u} className="text-[11px] text-indigo-300" />)}
                        <p className="truncate text-[10px] text-slate-600">{outras.length + 1} páginas</p>
                      </>
                    })()}
                  </td>
                </tr>
                {multi && abertos.has(l.lead) && <FaixaCompras compras={l.compras!} cor={st.cor} />}
                </Fragment>
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
        Nome, e-mail e telefone vêm da venda aprovada ou do aviso de abandono de carrinho da Hotmart, que chega 30 a 60 minutos depois. Como a Hotmart não manda o código da visita, o abandono é ligado pelo produto, país e horário, e só quando não há dúvida.
      </p>
    </div>
  )
}
