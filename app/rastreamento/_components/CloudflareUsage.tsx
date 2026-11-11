'use client'

import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import '../cfusage.css'

export const CF_PLANS_URL = 'https://dash.cloudflare.com/?to=/:account/workers/plans'

// Comparação do plano gratuito com o Workers Paid, usada na instalação e no painel.
export function CloudflarePlanCompare() {
  return (
    <div className="cf-compare">
      <div className="cf-col">
        <b>Plano gratuito</b>
        <span className="cf-price">US$ 0</span>
        <ul>
          <li>até <b>1.000 visitantes novos por dia</b></li>
          <li>passou disso, as vendas do resto do dia chegam no Facebook sem a origem do anúncio</li>
          <li>100 mil acessos ao robô por dia</li>
        </ul>
      </div>
      <div className="cf-col rec">
        <b>Workers Paid <em>recomendado</em></b>
        <span className="cf-price">US$ 5<small>/mês</small></span>
        <ul>
          <li>até <b>1 milhão de visitantes novos por mês</b> (cerca de <b>33 mil por dia</b>)</li>
          <li>todas as vendas chegam no Facebook com o clique do anúncio</li>
          <li>10 milhões de acessos ao robô por mês</li>
        </ul>
      </div>
    </div>
  )
}

export function CloudflarePlanText() {
  return (
    <>
      <p className="cf-p">
        O rastreamento roda na sua conta Cloudflare. A cada visitante novo, o robô guarda de qual anúncio ele veio (o clique, as UTMs, a cidade). É isso que liga a venda ao anúncio e faz o Facebook otimizar pro público certo.
      </p>
      <p className="cf-p">
        No plano gratuito da Cloudflare cabem <b>1.000 visitantes novos por dia</b>. No Workers Paid, por US$ 5 por mês, cabem cerca de 33 mil por dia, e nenhuma venda perde a origem. <b>Recomendamos o upgrade</b>: é barato e evita perder dados quando o tráfego cresce.
      </p>
    </>
  )
}

// v = esta instalação; conta = a conta da Cloudflare inteira (onde o limite vale)
type Dia = { date: string; v: number; conta?: number }
type Periodo = { dias: Dia[]; cortadoEm: string | null; robosIgnorados: number; robosAntesDaCorrecao: number }
type Usage = { available: boolean; paid: boolean; detected: boolean | null; today?: number; peak7?: number; month?: number; limitDay?: number; limitMonth?: number; periodo?: Periodo | null
  instToday?: number | null; instMonth?: number | null; porInstalacao?: boolean; instalacoesNaConta?: number }

const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const n = (v: number) => v.toLocaleString('pt-BR')

function Stat({ label, valor, sub, tom }: { label: string; valor: React.ReactNode; sub?: React.ReactNode; tom?: 'bad' | 'warn' | 'good' }) {
  const cor = tom === 'bad' ? 'text-rose-300' : tom === 'warn' ? 'text-amber-300' : tom === 'good' ? 'text-emerald-300' : 'text-slate-50'
  return (
    <div className="min-w-0 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="truncate text-[10.5px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-bold tabular-nums ${cor}`}>{valor}</p>
      {sub && <p className="truncate text-[10.5px] text-slate-500">{sub}</p>}
    </div>
  )
}

function TooltipUso({ active, payload, limite, multi }: { active?: boolean; payload?: { payload: Dia }[]; limite: number | null; multi: boolean }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const conta = d.conta ?? d.v
  return (
    <div className="rounded-lg border border-white/10 bg-[#0f0f1e] px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-500">{diaCurto(d.date)}</p>
      <p className="font-semibold text-slate-100">{n(d.v)} visitantes gravados{multi ? ' nesta instalação' : ''}</p>
      {multi && <p className="text-slate-400">conta toda: {n(conta)} (outras instalações: {n(conta - d.v)})</p>}
      {limite !== null && conta > limite && <p className="text-rose-300">{n(conta - limite)} acima do limite grátis{multi ? ' da conta' : ''}</p>}
    </div>
  )
}

// Uso do plano da Cloudflare no período escolhido no painel: visitantes
// gravados (é o que o plano gratuito limita, 1.000 por dia), dia a dia, e os
// robôs ignorados (não foram pro Facebook nem gastaram o plano).
export function UsageBar({ installationId, start, end, periodoLabel }: {
  installationId: string; start: string; end: string; periodoLabel: string
}) {
  const [u, setU] = useState<Usage | null>(null)
  // Qual período os números na tela representam: enquanto for diferente do
  // escolhido, o cartão mostra que está buscando os dados novos.
  const chave = `${installationId}|${start}|${end}`
  const [chaveCarregada, setChaveCarregada] = useState<string | null>(null)
  const carregando = chaveCarregada !== chave
  const [info, setInfo] = useState(false)
  // Aberto/fechado fica guardado no navegador.
  const [aberto, setAberto] = useState(() => {
    try { return typeof window === 'undefined' || localStorage.getItem('rastreamento:plano-aberto') !== '0' } catch { return true }
  })
  function alternar() {
    setAberto(a => {
      try { localStorage.setItem('rastreamento:plano-aberto', a ? '0' : '1') } catch { /* sem armazenamento */ }
      return !a
    })
  }

  useEffect(() => {
    let alive = true
    // dias do calendário local do período (início e último dia)
    const local = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
    const q = new URLSearchParams({ id: installationId, start, end, de: local(Date.parse(start)), ate: local(Date.parse(end) - 1) })
    const k = `${installationId}|${start}|${end}`
    const load = () => fetch(`/api/track/installations/usage?${q}`).then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive && j) setU(j) }).catch(() => {})
      .finally(() => { if (alive) setChaveCarregada(k) })
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [installationId, start, end])

  async function setPaid(paid: boolean) {
    setU(x => (x ? { ...x, paid } : x))
    await fetch('/api/track/installations/usage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: installationId, paid }) }).catch(() => null)
  }

  if (!u) {
    return (
      <div className="rounded-2xl border p-4 sm:p-5" style={{ background: '#151524', borderColor: 'rgba(255,255,255,0.07)' }} aria-busy="true">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-300">
          <Loader2 size={14} className="animate-spin text-indigo-400" />Plano da Cloudflare
          <span className="text-[11px] font-normal text-slate-500">buscando o uso de {periodoLabel.toLowerCase()}...</span>
        </div>
        {aberto && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-[62px] animate-pulse rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
          </div>
        )}
      </div>
    )
  }
  const paid = u.paid
  const limiteDia = u.limitDay ?? 1000
  const limiteMes = u.limitMonth ?? 1_000_000
  const per = u.periodo ?? null
  // Várias instalações na mesma conta da Cloudflare: os números são desta
  // instalação, mas o limite e a cobrança contam a conta inteira.
  const multi = !!u.porInstalacao && (u.instalacoesNaConta ?? 1) > 1
  const dias = (per?.dias ?? []).map(d => ({ ...d, conta: d.conta ?? d.v, outras: Math.max(0, (d.conta ?? d.v) - d.v) }))
  const total = dias.reduce((a, d) => a + d.v, 0)
  const totalConta = dias.reduce((a, d) => a + d.conta, 0)
  const pico = dias.reduce<Dia | null>((m, d) => (!m || d.v > m.v ? d : m), null)
  const media = dias.length ? Math.round(total / dias.length) : 0
  const mediaConta = dias.length ? Math.round(totalConta / dias.length) : 0
  const acima = dias.filter(d => d.conta > limiteDia).length
  const hoje = u.today ?? 0
  const hojeInst = multi ? (u.instToday ?? 0) : hoje
  const pctHoje = Math.min(100, (hoje / limiteDia) * 100)
  const pctMes = Math.min(100, ((u.month ?? 0) / limiteMes) * 100)
  const nivel = paid ? (pctMes >= 80 ? 'bad' : pctMes >= 60 ? 'warn' : 'ok') : (pctHoje >= 80 ? 'bad' : pctHoje >= 60 ? 'warn' : 'ok')
  const corBarra = (v: number) => (paid ? '#6366f1' : v > limiteDia ? '#f43f5e' : v >= limiteDia * 0.8 ? '#f59e0b' : '#6366f1')
  const picoConta = dias.reduce((m, d) => Math.max(m, multi ? d.conta : d.v), 0)
  const tetoY = paid ? Math.max(picoConta, 10) * 1.15 : Math.max(picoConta, limiteDia) * 1.15

  return (
    <div className="relative overflow-hidden rounded-2xl border p-4 sm:p-5" aria-busy={carregando} style={{
      background: '#151524',
      borderColor: nivel === 'bad' ? 'rgba(244,63,94,0.45)' : nivel === 'warn' ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.07)',
    }}>
      {carregando && <div aria-hidden className="cf-scan pointer-events-none absolute inset-x-0 top-0 h-[2px]" />}
      <div className={`flex flex-wrap items-center justify-between gap-3 ${aberto ? 'mb-4' : ''}`}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button type="button" onClick={alternar} aria-expanded={aberto} className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-200 hover:text-white" title={aberto ? 'Esconder' : 'Mostrar'}>
            <ChevronDown size={15} className={`text-slate-400 transition-transform ${aberto ? '' : '-rotate-90'}`} />
            Plano da Cloudflare
          </button>
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${paid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.06] text-slate-300'}`}>
            {paid ? 'Workers Paid' : 'plano gratuito · 1.000 visitantes por dia'}
          </span>
          <span className="text-[11px] text-slate-500">{periodoLabel}</span>
          {carregando && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-indigo-300">
              <Loader2 size={11} className="animate-spin" />buscando dados...
            </span>
          )}
          {!carregando && !aberto && u.available && per && (
            <span className={`text-[11px] font-semibold ${!paid && acima ? 'text-rose-300' : 'text-slate-400'}`}>
              · {multi ? `nesta instalação hoje ${n(hojeInst)} · conta toda ` : ''}{paid ? `uso do mês ${Math.round(pctMes)}%` : `hoje ${n(hoje)} de ${n(limiteDia)}${acima ? ` · ${acima} dia(s) acima do limite` : ''}`}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="text-[11px] font-semibold text-amber-300 hover:underline" onClick={() => setInfo(true)}>por que isso importa?</button>
          {!paid && <a href={CF_PLANS_URL} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-emerald-950 hover:bg-emerald-400">fazer upgrade (US$ 5/mês) →</a>}
        </div>
      </div>

      {!aberto ? null : !u.available || !per ? (
        <p className="text-xs text-slate-500">O uso aparece aqui depois que o robô começar a receber visitas.</p>
      ) : (
        <div className={`transition-opacity duration-200 ${carregando ? 'pointer-events-none animate-pulse opacity-40' : 'opacity-100'}`}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="Visitantes gravados" valor={n(total)} sub={multi ? `conta toda: ${n(totalConta)}` : dias.length > 1 ? `em ${dias.length} dias` : diaCurto(dias[0]?.date ?? '')} />
            <Stat label="Média por dia" valor={n(media)} sub={multi ? `conta toda: ${n(mediaConta)} por dia` : paid ? 'sem limite diário' : `limite: ${n(limiteDia)} por dia`} />
            <Stat label="Dia de pico" valor={n(pico?.v ?? 0)} sub={pico && pico.v > 0 ? diaCurto(pico.date) : 'sem visitas'} tom={!paid && !multi && (pico?.v ?? 0) > limiteDia ? 'bad' : undefined} />
            {paid
              ? <Stat label={multi ? 'Uso do mês (conta)' : 'Uso do mês'} valor={`${Math.round(pctMes)}%`} sub={`${n(u.month ?? 0)} de ${n(limiteMes)}`} tom={pctMes >= 80 ? 'bad' : pctMes >= 60 ? 'warn' : 'good'} />
              : <Stat label={multi ? 'Dias acima (conta)' : 'Dias acima do limite'} valor={`${acima} de ${dias.length}`} sub={acima ? `${multi ? 'a conta passou' : 'passou'} de 1.000 nesses dias` : 'nenhum dia estourou'} tom={acima ? 'bad' : 'good'} />}
            {multi
              ? <Stat label="Hoje" valor={n(hojeInst)} sub={paid ? `conta toda: ${n(hoje)}` : `conta toda: ${n(hoje)} de ${n(limiteDia)}`} tom={paid ? undefined : pctHoje >= 80 ? 'bad' : pctHoje >= 60 ? 'warn' : 'good'} />
              : <Stat label="Hoje" valor={paid ? n(hoje) : `${Math.round(pctHoje)}%`} sub={paid ? 'visitantes gravados' : `${n(hoje)} de ${n(limiteDia)}`} tom={paid ? undefined : pctHoje >= 80 ? 'bad' : pctHoje >= 60 ? 'warn' : 'good'} />}
            <Stat label="Robôs ignorados" valor={n(per.robosIgnorados)} sub="não gastaram o plano" tom={per.robosIgnorados ? 'good' : undefined} />
          </div>

          {dias.length > 1 ? (
            <div className="mt-4 h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dias} margin={{ top: 14, right: 4, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={diaCurto} tick={{ fill: '#475569', fontSize: 10.5 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis tick={{ fill: '#475569', fontSize: 10.5 }} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, Math.ceil(tetoY)]} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(v))} />
                  <Tooltip content={<TooltipUso limite={paid ? null : limiteDia} multi={multi} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  {!paid && <ReferenceLine y={limiteDia} stroke="#f43f5e" strokeDasharray="5 4" label={{ value: 'limite grátis: 1.000 por dia', position: 'insideTopRight', fill: '#fda4af', fontSize: 10.5 }} />}
                  <Bar dataKey="v" stackId="u" radius={multi ? [0, 0, 0, 0] : [3, 3, 0, 0]} maxBarSize={22}>
                    {dias.map(d => <Cell key={d.date} fill={corBarra(multi ? d.conta : d.v)} />)}
                  </Bar>
                  {multi && <Bar dataKey="outras" stackId="u" radius={[3, 3, 0, 0]} maxBarSize={22} fill="rgba(148,163,184,0.25)" />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-4">
              <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, ((dias[0]?.v ?? 0) / (paid ? Math.max(dias[0]?.v ?? 1, 1) : limiteDia)) * 100))}%`, background: corBarra(dias[0]?.v ?? 0) }} />
              </div>
            </div>
          )}

          <div className="mt-3 space-y-1 text-[11px] leading-snug text-slate-500">
            {multi && (
              <p>Os números são desta instalação. O limite e a cobrança valem para a conta da Cloudflare inteira, que tem {u.instalacoesNaConta} instalações: no gráfico, a parte cinza é o que as outras gravaram.</p>
            )}
            {!paid && acima > 0 && (
              <p className="text-rose-300">Em {acima} dia(s) {multi ? 'a conta toda passou' : 'passou'} de 1.000 visitantes. Se a conta estava no plano gratuito nesses dias, as vendas depois do limite chegaram no Facebook sem a origem do anúncio.</p>
            )}
            {per.robosAntesDaCorrecao > 0 && (
              <p>🤖 Outros {n(per.robosAntesDaCorrecao)} acessos de robô chegaram antes da correção de 07/11 e foram contados no plano.</p>
            )}
            {per.cortadoEm && <p>A Cloudflare guarda o uso só dos últimos 90 dias: o gráfico começa em {diaCurto(per.cortadoEm)}.</p>}
            {!paid && <p>O dia da Cloudflare vira à meia-noite de Londres (21h de Brasília).</p>}
            <p>
              {u.detected === null
                ? <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={paid} onChange={e => void setPaid(e.target.checked)} />minha conta já está no Workers Paid</label>
                : 'Plano reconhecido automaticamente.'}
            </p>
          </div>
        </div>
      )}
      <style>{`@keyframes cfScan { from { transform: translateX(-100%) } to { transform: translateX(100%) } } .cf-scan { background: linear-gradient(90deg, transparent, #818cf8, transparent); animation: cfScan 1s ease-in-out infinite }`}</style>

      {info && (
        <Modal open onClose={() => setInfo(false)} title="Plano da Cloudflare" maxWidth="max-w-lg">
          <div className="cf-modal"><CloudflarePlanText /><CloudflarePlanCompare />
            <a href={CF_PLANS_URL} target="_blank" rel="noopener noreferrer" className="cf-up">abrir os planos na Cloudflare →</a>
            {u.detected === null && <p className="cf-p" style={{ marginTop: 10 }}>Fez o upgrade? Marque “minha conta já está no Workers Paid” e a barra passa a contar o limite do mês. Pra o sistema reconhecer sozinho, edite o seu token na Cloudflare e, em “Conta e faturamento”, marque “Lido” na linha “Cobrança”.</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
