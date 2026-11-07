'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { RefreshCw, ShoppingBag, Wallet, Receipt, Percent, Send, Info, CalendarDays } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { EventExplorer } from './EventsPanel'

// ---------- tipos que vêm da função track_dashboard (migration 099) ----------
type Venda = {
  received_at: string
  source: string
  session_hit: boolean | null
  capi_send_ok: boolean | null
  com_fbc: boolean
  geo_country: string | null
  utm_source: string | null
  utm_campaign: string | null
  utm_content: string | null
  src: string | null
  valor: string | number | null
  moeda: string | null
  produto: string | null
  transacao: string | null
  pais_comprador: string | null
}
type Bloco = {
  funil: Record<string, number>
  serie: { b: string; pv: number; ic: number; vendas: number }[]
  paises: { c: string; n: number }[]
  qualidade: {
    capi: number; com_fbp: number; com_fbc: number; falhas: number
    vendas_meta: number; vendas_sessao: number; vendas_fora: number; ic_detectado: number
  } | null
  resumido: boolean
  vendas: Venda[]
}
type Resposta = { atual: Bloco; anterior: Bloco | null }

type PeriodoId = 'hoje' | 'ontem' | '7d' | '30d' | 'dia'
const PERIODOS: { id: PeriodoId; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
]

const FUNIL: { ev: string; label: string; dica: string }[] = [
  { ev: 'PageView', label: 'Visitas', dica: 'PageView: abriram a página' },
  { ev: 'ViewContent', label: 'Rolaram a página', dica: 'ViewContent: ficaram e rolaram a página' },
  { ev: 'AddToCart', label: 'Clicaram em comprar', dica: 'AddToCart: clicaram no botão de compra' },
  { ev: 'InitiateCheckout', label: 'Foram pro checkout', dica: 'InitiateCheckout: chegaram no checkout' },
  { ev: 'Purchase', label: 'Compraram', dica: 'Purchase: venda aprovada' },
]
const FUNIL_COR = ['#6366f1', '#7c6cf3', '#8b5cf6', '#a855f7', '#22c55e']

const RETENCAO_MS = 45 * 86400000
const LIVE_MS = 30_000

// ---------- utilidades ----------
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'
const inteiro = (n: number) => n.toLocaleString('pt-BR')

function dinheiro(v: number, moeda: string | null) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(v)
  } catch {
    return `${moeda ?? ''} ${v.toFixed(2)}`
  }
}
function pct(a: number, b: number): number | null {
  return b > 0 ? (a / b) * 100 : null
}
function pctTxt(p: number | null, casas = 1) {
  return p === null ? '-' : `${p.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: p < 10 && p > 0 ? casas : 0 })}%`
}
function dataKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function nomePais(iso: string | null) {
  if (!iso) return 'Desconhecido'
  try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(iso.toUpperCase()) ?? iso } catch { return iso }
}
// Etiqueta com a sigla do país (emoji de país não aparece no Windows).
function Sigla({ iso }: { iso: string | null }) {
  return (
    <span className="inline-flex w-7 shrink-0 justify-center rounded px-1 py-px font-mono text-[9.5px] font-semibold text-slate-400" style={{ background: 'rgba(255,255,255,0.07)' }}>
      {iso ? iso.toUpperCase() : '??'}
    </span>
  )
}
// A Meta manda "NOME|ID" em utm_campaign e utm_content; só o nome interessa aqui.
const semId = (s: string | null) => (s ? s.split('|')[0].trim() || null : null)
function horaCurta(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function intervalo(p: PeriodoId, dia: string) {
  const now = new Date()
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
  let s: Date, e: Date
  if (p === 'hoje') { s = d0; e = add(d0, 1) }
  else if (p === 'ontem') { s = add(d0, -1); e = d0 }
  else if (p === '7d') { s = add(d0, -6); e = add(d0, 1) }
  else if (p === '30d') { s = add(d0, -29); e = add(d0, 1) }
  else { const [y, m, dd] = dia.split('-').map(Number); s = new Date(y, m - 1, dd); e = add(s, 1) }
  const umDia = e.getTime() - s.getTime() <= 86400000 + 3600000
  const hourly = umDia && Date.now() - s.getTime() < RETENCAO_MS
  return { start: s.toISOString(), end: e.toISOString(), s, e, hourly }
}

// Preenche os buracos do gráfico (hora ou dia sem nenhum evento vira zero).
function montarSerie(serie: Bloco['serie'], s: Date, e: Date, hourly: boolean) {
  const mapa = new Map(serie.map(r => [r.b, r]))
  const out: { label: string; visitas: number; checkouts: number; vendas: number }[] = []
  if (hourly) {
    const ate = Math.min(e.getTime(), Date.now())
    for (let t = new Date(s); t.getTime() < ate; t = new Date(t.getTime() + 3600000)) {
      const k = `${dataKey(t)}T${String(t.getHours()).padStart(2, '0')}`
      const r = mapa.get(k)
      out.push({ label: `${String(t.getHours()).padStart(2, '0')}h`, visitas: r?.pv ?? 0, checkouts: r?.ic ?? 0, vendas: r?.vendas ?? 0 })
    }
  } else {
    for (let t = new Date(s); t < e; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)) {
      const k = dataKey(t)
      const r = mapa.get(k)
      out.push({ label: t.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), visitas: r?.pv ?? 0, checkouts: r?.ic ?? 0, vendas: r?.vendas ?? 0 })
    }
  }
  return out
}

function vendasUnicas(vs: Venda[]) {
  const vistas = new Set<string>()
  return vs.filter(v => {
    if (!v.transacao) return true
    if (vistas.has(v.transacao)) return false
    vistas.add(v.transacao)
    return true
  })
}
function porMoeda(vs: Venda[]) {
  const m = new Map<string, { total: number; n: number }>()
  for (const v of vs) {
    const valor = Number(v.valor)
    if (!Number.isFinite(valor)) continue
    const k = v.moeda || 'BRL'
    const cur = m.get(k) ?? { total: 0, n: 0 }
    cur.total += valor; cur.n += 1
    m.set(k, cur)
  }
  return [...m.entries()].map(([moeda, x]) => ({ moeda, ...x })).sort((a, b) => b.n - a.n)
}

// ---------- pedaços visuais ----------
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-4 sm:p-5 ${className}`} style={{ background: '#151524', borderColor: 'rgba(255,255,255,0.07)' }}>
      {children}
    </div>
  )
}
function Titulo({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h3 className="text-[13px] font-semibold text-slate-200">{children}</h3>
      {extra}
    </div>
  )
}

function Variacao({ atual, anterior }: { atual: number; anterior: number | null | undefined }) {
  if (anterior === null || anterior === undefined) return null
  if (anterior === 0) {
    if (atual === 0) return <span className="text-[11px] text-slate-600">igual ao período anterior</span>
    return <span className="text-[11px] text-emerald-400">antes: 0</span>
  }
  const d = ((atual - anterior) / anterior) * 100
  const up = d >= 0
  return (
    <span className={`text-[11px] font-medium ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(d).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
      <span className="font-normal text-slate-600"> vs anterior</span>
    </span>
  )
}

function Kpi({ icon, label, children, rodape, destaque }: {
  icon: React.ReactNode; label: string; children: React.ReactNode; rodape?: React.ReactNode; destaque?: boolean
}) {
  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-2xl border p-4"
      style={{
        background: destaque ? 'linear-gradient(160deg, rgba(34,197,94,0.12), rgba(21,21,36,1) 60%)' : '#151524',
        borderColor: destaque ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.07)',
      }}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        <span className={destaque ? 'text-emerald-400' : 'text-indigo-400'}>{icon}</span>
        {label}
      </div>
      <div className="min-w-0">{children}</div>
      {rodape && <div className="mt-auto">{rodape}</div>}
    </div>
  )
}

function Barra({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  const w = max > 0 ? Math.max((valor / max) * 100, valor > 0 ? 2 : 0) : 0
  return (
    <div className="h-2 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${w}%`, background: cor }} />
    </div>
  )
}

function Medidor({ label, valor, dica, bom = 70, ok = 40 }: { label: string; valor: number | null; dica: string; bom?: number; ok?: number }) {
  const cor = valor === null ? '#475569' : valor >= bom ? '#22c55e' : valor >= ok ? '#f59e0b' : '#f43f5e'
  return (
    <div className="space-y-1.5" title={dica}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-sm font-semibold tabular-nums" style={{ color: cor }}>{pctTxt(valor, 0)}</span>
      </div>
      <Barra valor={valor ?? 0} max={100} cor={cor} />
      <p className="text-[10.5px] leading-snug text-slate-600">{dica}</p>
    </div>
  )
}

function TooltipGrafico({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f1e] px-3 py-2.5 shadow-xl">
      <p className="mb-1.5 text-xs text-slate-500">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="flex items-center gap-2 text-xs text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <b className="text-slate-100">{inteiro(p.value)}</b>
        </p>
      ))}
    </div>
  )
}

type AbaOrigem = 'campanha' | 'anuncio' | 'produto' | 'pais'

// ---------- painel ----------
export function TrackDashboard({ installationId }: { installationId: string }) {
  const [periodo, setPeriodo] = useState<PeriodoId>('hoje')
  const [dia, setDia] = useState(() => dataKey(new Date()))
  const [dados, setDados] = useState<Resposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregadoChave, setCarregadoChave] = useState<string | null>(null)
  const [atualizando, setAtualizando] = useState(false)
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null)
  const [tick, setTick] = useState(0)
  const [aba, setAba] = useState<AbaOrigem>('campanha')
  const pedido = useRef(0)

  const r = useMemo(() => intervalo(periodo, dia), [periodo, dia])
  const aoVivo = periodo === 'hoje'
  const chave = `${installationId}|${r.start}|${r.end}`
  // carregando = ainda não chegou a resposta do período escolhido agora
  const carregando = carregadoChave !== chave

  // Quem pede atualização silenciosa (botão ou ao vivo) liga o "atualizando" antes.
  const carregar = useCallback(async () => {
    const id = ++pedido.current
    const q = new URLSearchParams({ installation_id: installationId, start: r.start, end: r.end, tz: tz(), hourly: r.hourly ? '1' : '0' })
    try {
      const res = await fetch(`/api/track/events/dashboard?${q}`)
      const json = await res.json().catch(() => ({}))
      if (id !== pedido.current) return
      if (!res.ok) { setErro(json?.error || 'Não foi possível carregar o painel.'); return }
      setErro(null)
      setDados(json as Resposta)
      setAtualizadoEm(new Date())
    } catch {
      if (id === pedido.current) setErro('Sem conexão. Tente de novo em instantes.')
    } finally {
      if (id === pedido.current) { setCarregadoChave(chave); setAtualizando(false) }
    }
  }, [installationId, r, chave])

  useEffect(() => {
    // carregar só mexe no estado depois do fetch responder (nada síncrono aqui)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  useEffect(() => {
    if (!aoVivo) return
    const t = setInterval(() => { setAtualizando(true); void carregar(); setTick(x => x + 1) }, LIVE_MS)
    return () => clearInterval(t)
  }, [aoVivo, carregar])

  function atualizarAgora() {
    setAtualizando(true)
    void carregar()
    setTick(x => x + 1)
  }

  const a = dados?.atual
  const ant = dados?.anterior

  const calc = useMemo(() => {
    if (!a) return null
    const vendas = vendasUnicas(a.vendas)
    const moedas = porMoeda(vendas)
    const visitas = a.funil.PageView ?? 0
    const nVendas = a.funil.Purchase ?? 0
    const q = a.qualidade
    const antVisitas = ant?.funil.PageView ?? 0
    const antVendas = ant?.funil.Purchase ?? 0
    const antMoedas = ant ? porMoeda(vendasUnicas(ant.vendas)) : []
    return {
      vendas, moedas, visitas, nVendas,
      conv: pct(nVendas, visitas),
      antConv: ant ? pct(antVendas, antVisitas) : null,
      antVisitas: ant ? antVisitas : null,
      antVendas: ant ? antVendas : null,
      antMoedas,
      checkoutConv: pct(nVendas, a.funil.InitiateCheckout ?? 0),
      fbc: q ? pct(q.com_fbc, q.capi) : null,
      fbp: q ? pct(q.com_fbp, q.capi) : null,
      sessao: q ? pct(q.vendas_sessao, q.vendas_meta) : null,
      serie: montarSerie(a.serie, r.s, r.e, r.hourly),
    }
  }, [a, ant, r])

  const origem = useMemo(() => {
    if (!calc) return []
    const m = new Map<string, { nome: string; sub?: string; n: number; moedas: Map<string, number> }>()
    for (const v of calc.vendas) {
      let k: string, nome: string, sub: string | undefined
      if (aba === 'campanha') {
        const c = semId(v.utm_campaign)
        k = c ?? (v.src ? `src:${v.src}` : '-')
        nome = c ?? (v.src ? v.src : 'Sem campanha')
        sub = c ? (v.utm_source ?? undefined) : v.src ? 'código src (sem UTM)' : 'direto, orgânico ou sem UTM'
      } else if (aba === 'anuncio') {
        const ad = semId(v.utm_content)
        k = ad ?? '-'; nome = ad ?? 'Sem anúncio identificado'
        sub = ad ? semId(v.utm_campaign) ?? undefined : 'venda sem utm_content'
      } else if (aba === 'produto') {
        k = v.produto ?? '-'; nome = v.produto ?? 'Produto não informado'
      } else {
        const iso = v.pais_comprador || v.geo_country
        k = iso ?? '-'; nome = nomePais(iso)
      }
      const cur = m.get(k) ?? { nome, sub, n: 0, moedas: new Map() }
      cur.n += 1
      const valor = Number(v.valor)
      if (Number.isFinite(valor)) cur.moedas.set(v.moeda || 'BRL', (cur.moedas.get(v.moeda || 'BRL') ?? 0) + valor)
      m.set(k, cur)
    }
    return [...m.values()].sort((x, y) => y.n - x.n).slice(0, 8)
  }, [calc, aba])

  // ---------- topo: período ----------
  const barraPeriodo = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl p-1" style={{ background: '#151524', border: '1px solid rgba(255,255,255,0.07)' }}>
          {PERIODOS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriodo(p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${periodo === p.id ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs ${periodo === 'dia' ? 'text-indigo-200 ring-1 ring-indigo-500/50' : 'text-slate-400'}`}
          style={{ background: '#151524', border: '1px solid rgba(255,255,255,0.07)' }}
          title="Escolher um dia"
        >
          <CalendarDays size={13} />
          <input
            type="date"
            value={dia}
            max={dataKey(new Date())}
            onChange={e => { if (e.target.value) { setDia(e.target.value); setPeriodo('dia') } }}
            className="bg-transparent text-xs outline-none [color-scheme:dark]"
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        {aoVivo ? (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Ao vivo
          </span>
        ) : atualizadoEm && (
          <span className="text-[11px] text-slate-600">atualizado às {atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        )}
        <button
          onClick={atualizarAgora}
          disabled={atualizando || carregando}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30 transition-colors hover:bg-indigo-500/15 disabled:opacity-60"
        >
          {atualizando ? <Spinner size={12} /> : <RefreshCw size={12} />}
          Atualizar
        </button>
      </div>
    </div>
  )

  if (carregando && !dados) {
    return <div className="space-y-5">{barraPeriodo}<div className="flex justify-center py-20"><Spinner size={24} /></div></div>
  }
  if (erro && !dados) {
    return <div className="space-y-5">{barraPeriodo}<Card><p className="text-sm text-rose-300">{erro}</p></Card></div>
  }
  if (!a || !calc) return null

  const maxFunil = Math.max(...FUNIL.map(f => a.funil[f.ev] ?? 0), 1)
  const maxPais = Math.max(...a.paises.map(p => p.n), 1)
  const maxOrigem = Math.max(...origem.map(o => o.n), 1)
  const ticket = calc.moedas.map(m => ({ moeda: m.moeda, v: m.n > 0 ? m.total / m.n : 0 }))
  const q = a.qualidade
  const enviadas = q?.vendas_meta ?? 0
  const semVenda = calc.nVendas === 0

  return (
    <div className={`space-y-5 transition-opacity ${carregando ? 'opacity-60' : ''}`}>
      {barraPeriodo}

      {a.resumido && (
        <div className="flex gap-2 rounded-xl px-3 py-2.5 text-xs text-amber-200 ring-1 ring-amber-500/25" style={{ background: 'rgba(245,158,11,0.08)' }}>
          <Info size={14} className="mt-0.5 shrink-0" />
          Parte desse período tem mais de 45 dias: os totais de visitas e cliques continuam guardados, mas o detalhe de cada um já foi apagado pra não pesar o banco. As vendas ficam sempre completas.
        </div>
      )}

      {/* ---------- indicadores ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={<ShoppingBag size={14} />} label="Vendas" destaque rodape={<Variacao atual={calc.nVendas} anterior={calc.antVendas} />}>
          <p className="text-3xl font-bold tabular-nums text-slate-50">{inteiro(calc.nVendas)}</p>
        </Kpi>
        <Kpi icon={<Wallet size={14} />} label="Faturamento" rodape={calc.antMoedas.length > 0 && calc.moedas.length > 0
          ? <Variacao atual={calc.moedas[0].total} anterior={calc.antMoedas.find(m => m.moeda === calc.moedas[0].moeda)?.total ?? 0} />
          : undefined}>
          {calc.moedas.length === 0 ? (
            <p className="text-2xl font-bold text-slate-600">-</p>
          ) : (
            <div className="space-y-0.5">
              {calc.moedas.map((m, i) => (
                <p key={m.moeda} className={`truncate font-bold tabular-nums ${i === 0 ? 'text-2xl text-slate-50' : 'text-sm text-slate-300'}`}>
                  {dinheiro(m.total, m.moeda)}
                </p>
              ))}
            </div>
          )}
        </Kpi>
        <Kpi icon={<Receipt size={14} />} label="Ticket médio">
          {ticket.length === 0 ? (
            <p className="text-2xl font-bold text-slate-600">-</p>
          ) : (
            <div className="space-y-0.5">
              {ticket.map((t, i) => (
                <p key={t.moeda} className={`truncate font-bold tabular-nums ${i === 0 ? 'text-2xl text-slate-50' : 'text-sm text-slate-300'}`}>{dinheiro(t.v, t.moeda)}</p>
              ))}
            </div>
          )}
        </Kpi>
        <Kpi icon={<Percent size={14} />} label="Conversão" rodape={
          <span className="text-[11px] text-slate-500">{inteiro(calc.visitas)} visitas · checkout→venda {pctTxt(calc.checkoutConv)}</span>
        }>
          <p className="text-3xl font-bold tabular-nums text-slate-50">{pctTxt(calc.conv, 2)}</p>
        </Kpi>
        <Kpi icon={<Send size={14} />} label="Enviadas ao Facebook" rodape={
          <span className="text-[11px] text-slate-500">{pctTxt(calc.sessao, 0)} com a origem do anúncio</span>
        }>
          <p className="text-3xl font-bold tabular-nums text-slate-50">
            {inteiro(enviadas)}<span className="text-base font-medium text-slate-500"> / {inteiro(calc.nVendas)}</span>
          </p>
        </Kpi>
      </div>

      {/* ---------- gráfico + funil ---------- */}
      <div className="grid gap-3 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <Titulo extra={
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-indigo-500/60" />Visitas</span>
              <span className="flex items-center gap-1"><span className="h-0.5 w-3 rounded bg-violet-400" />Checkouts</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />Vendas</span>
            </div>
          }>
            {r.hourly ? 'Hora a hora' : 'Dia a dia'}
          </Titulo>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={calc.serie} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={14} />
                <YAxis yAxisId="v" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis yAxisId="s" orientation="right" hide allowDecimals={false} domain={[0, (max: number) => Math.max(max * 1.4, 2)]} />
                <Tooltip content={<TooltipGrafico />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar yAxisId="v" dataKey="visitas" name="Visitas" fill="rgba(99,102,241,0.55)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Line yAxisId="v" type="monotone" dataKey="checkouts" name="Checkouts" stroke="#a78bfa" strokeWidth={2} dot={false} />
                <Line yAxisId="s" type="monotone" dataKey="vendas" name="Vendas" stroke="#34d399" strokeWidth={0} dot={(p: { cx?: number; cy?: number; value?: number; index?: number }) => (
                  p.value ? <circle key={p.index} cx={p.cx} cy={p.cy} r={5} fill="#34d399" stroke="#0b0b14" strokeWidth={2} /> : <g key={p.index} />
                )} activeDot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <Titulo extra={<span className="text-[11px] text-slate-600">% de quem passou da etapa anterior</span>}>Funil de eventos</Titulo>
          <div className="space-y-3.5">
            {FUNIL.map((f, i) => {
              const n = a.funil[f.ev] ?? 0
              const anterior = i > 0 ? a.funil[FUNIL[i - 1].ev] ?? 0 : null
              const passo = anterior !== null ? pct(n, anterior) : null
              return (
                <div key={f.ev} title={f.dica}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="truncate text-xs text-slate-300">
                      {f.label} <span className="text-[10px] text-slate-600">{f.ev}</span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      {passo !== null && <span className="text-[11px] text-slate-500">{pctTxt(passo)}</span>}
                      <b className="text-sm tabular-nums text-slate-100">{inteiro(n)}</b>
                    </span>
                  </div>
                  <Barra valor={n} max={maxFunil} cor={FUNIL_COR[i]} />
                </div>
              )
            })}
          </div>
          {(q?.ic_detectado ?? 0) > 0 && (
            <p className="mt-4 text-[10.5px] leading-snug text-slate-600">
              + {inteiro(q!.ic_detectado)} cliques no link do checkout detectados pelo robô (contam só aqui, não são enviados ao Facebook).
            </p>
          )}
        </Card>
      </div>

      {/* ---------- origem das vendas + países + qualidade ---------- */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Titulo extra={
            <div className="flex flex-wrap rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
              {([['campanha', 'Campanha'], ['anuncio', 'Anúncio'], ['produto', 'Produto'], ['pais', 'País']] as [AbaOrigem, string][]).map(([id, l]) => (
                <button key={id} onClick={() => setAba(id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${aba === id ? 'bg-white/10 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
                  {l}
                </button>
              ))}
            </div>
          }>
            De onde vieram as vendas
          </Titulo>
          {semVenda ? (
            <p className="py-8 text-center text-sm text-slate-600">Nenhuma venda nesse período.</p>
          ) : (
            <div className="space-y-3">
              {origem.map((o, i) => (
                <div key={i} className="min-w-0">
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-200" title={o.nome}>{o.nome}</p>
                      {o.sub && <p className="truncate text-[10.5px] text-slate-600">{o.sub}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums text-slate-100">{o.n} <span className="text-[10.5px] font-normal text-slate-500">{o.n === 1 ? 'venda' : 'vendas'}</span></p>
                      <p className="text-[10.5px] tabular-nums text-slate-500">{[...o.moedas.entries()].map(([m, v]) => dinheiro(v, m)).join(' + ')}</p>
                    </div>
                  </div>
                  <Barra valor={o.n} max={maxOrigem} cor="#22c55e" />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <Titulo>Qualidade do rastreamento</Titulo>
          <div className="space-y-4">
            <Medidor label="Vendas com a origem do anúncio" valor={calc.sessao} bom={80} ok={50}
              dica="Venda que o robô conseguiu ligar à visita (clique, UTMs, cidade). Quanto maior, melhor o Facebook otimiza." />
            <Medidor label="Eventos com clique do anúncio (fbc)" valor={calc.fbc} bom={50} ok={25}
              dica="Visitantes que chegaram por um anúncio do Facebook. Tráfego orgânico ou direto não tem fbc." />
            <Medidor label="Eventos com navegador identificado (fbp)" valor={calc.fbp} bom={90} ok={70}
              dica="Identificador do navegador que o Facebook usa pra cruzar o visitante." />
            {(q?.falhas ?? 0) > 0 && (
              <p className="rounded-lg px-2.5 py-2 text-[11px] text-rose-300 ring-1 ring-rose-500/25" style={{ background: 'rgba(244,63,94,0.08)' }}>
                {inteiro(q!.falhas)} envio(s) recusado(s) pelo Facebook nesse período. Confira o token do pixel na instalação.
              </p>
            )}
            {(q?.vendas_fora ?? 0) > 0 && (
              <p className="rounded-lg px-2.5 py-2 text-[11px] text-amber-200 ring-1 ring-amber-500/25" style={{ background: 'rgba(245,158,11,0.08)' }}>
                {inteiro(q!.vendas_fora)} venda(s) registrada(s) sem envio ao Facebook (filtro de produto ou do código -tracker). É o filtro funcionando.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <Titulo extra={calc.vendas.length > 0 && <span className="text-[11px] text-slate-600">{calc.vendas.length} no período</span>}>Últimas vendas</Titulo>
          {calc.vendas.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-600">Nenhuma venda nesse período.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wider text-slate-600">
                    <th className="px-4 pb-2 font-medium sm:pl-5">Quando</th>
                    <th className="px-2 pb-2 font-medium">Produto</th>
                    <th className="px-2 pb-2 font-medium">Origem</th>
                    <th className="px-2 pb-2 font-medium">País</th>
                    <th className="px-4 pb-2 text-right font-medium sm:pr-5">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.vendas.slice(0, 12).map((v, i) => {
                    const camp = semId(v.utm_campaign)
                    const ad = semId(v.utm_content)
                    const iso = v.pais_comprador || v.geo_country
                    const valor = Number(v.valor)
                    return (
                      <tr key={v.transacao ?? i} className="border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-400 sm:pl-5">{horaCurta(v.received_at)}</td>
                        <td className="max-w-[180px] truncate px-2 py-2.5 text-slate-200" title={v.produto ?? ''}>{v.produto ?? '-'}</td>
                        <td className="max-w-[200px] px-2 py-2.5">
                          <p className="truncate text-slate-300" title={camp ?? v.src ?? ''}>{camp ?? (v.src ? `src: ${v.src}` : 'Sem campanha')}</p>
                          {ad && <p className="truncate text-[10.5px] text-slate-600" title={ad}>{ad}</p>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-slate-400" title={nomePais(iso)}><Sigla iso={iso} /></td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right sm:pr-5">
                          <span className="font-semibold tabular-nums text-emerald-300">{Number.isFinite(valor) ? dinheiro(valor, v.moeda) : '-'}</span>
                          <span className="ml-1.5" title={v.source === 'capi' ? (v.session_hit ? 'Enviada ao Facebook com a origem do anúncio' : 'Enviada ao Facebook sem achar a visita') : 'Não enviada ao Facebook (filtro)'}>
                            {v.source === 'capi' ? (v.capi_send_ok === false ? '❌' : v.session_hit ? '✅' : '⚠️') : '⏸️'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="px-4 pt-2 text-[10.5px] text-slate-600 sm:px-5">✅ enviada com a origem do anúncio · ⚠️ enviada sem achar a visita · ⏸️ não enviada (filtro) · ❌ Facebook recusou</p>
            </div>
          )}
        </Card>

        <Card>
          <Titulo>De onde vêm as visitas</Titulo>
          {a.paises.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-600">Sem visitas nesse período.</p>
          ) : (
            <div className="space-y-3">
              {a.paises.map(p => (
                <div key={p.c}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2 truncate text-slate-300"><Sigla iso={p.c} />{nomePais(p.c)}</span>
                    <span className="shrink-0 tabular-nums text-slate-400">
                      {inteiro(p.n)} <span className="text-[10.5px] text-slate-600">{pctTxt(pct(p.n, calc.visitas), 0)}</span>
                    </span>
                  </div>
                  <Barra valor={p.n} max={maxPais} cor="#6366f1" />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ---------- eventos um por um ---------- */}
      <EventExplorer
        key={`${installationId}|${r.start}|${r.end}`}
        installationId={installationId}
        start={r.start}
        end={r.end}
        refreshTick={tick}
        counts={{
          ...a.funil,
          InitiateCheckout: (a.funil.InitiateCheckout ?? 0) + (q?.ic_detectado ?? 0),
        }}
      />
    </div>
  )
}
