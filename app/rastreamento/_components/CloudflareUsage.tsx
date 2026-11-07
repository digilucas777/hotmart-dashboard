'use client'

import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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

type Periodo = { dias: { date: string; v: number }[]; cortadoEm: string | null; robosIgnorados: number; robosAntesDaCorrecao: number }
type Usage = { available: boolean; paid: boolean; detected: boolean | null; today?: number; peak7?: number; month?: number; limitDay?: number; limitMonth?: number; periodo?: Periodo | null }

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

function TooltipUso({ active, payload, limite }: { active?: boolean; payload?: { payload: { date: string; v: number } }[]; limite: number | null }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border border-white/10 bg-[#0f0f1e] px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-500">{diaCurto(d.date)}</p>
      <p className="font-semibold text-slate-100">{n(d.v)} visitantes gravados</p>
      {limite !== null && d.v > limite && <p className="text-rose-300">{n(d.v - limite)} acima do limite grátis</p>}
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
  const [info, setInfo] = useState(false)

  useEffect(() => {
    let alive = true
    const q = new URLSearchParams({ id: installationId, start, end })
    const load = () => fetch(`/api/track/installations/usage?${q}`).then(r => (r.ok ? r.json() : null)).then(j => { if (alive && j) setU(j) }).catch(() => {})
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [installationId, start, end])

  async function setPaid(paid: boolean) {
    setU(x => (x ? { ...x, paid } : x))
    await fetch('/api/track/installations/usage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: installationId, paid }) }).catch(() => null)
  }

  if (!u) return null
  const paid = u.paid
  const limiteDia = u.limitDay ?? 1000
  const limiteMes = u.limitMonth ?? 1_000_000
  const per = u.periodo ?? null
  const dias = per?.dias ?? []
  const total = dias.reduce((a, d) => a + d.v, 0)
  const pico = dias.reduce<{ date: string; v: number } | null>((m, d) => (!m || d.v > m.v ? d : m), null)
  const media = dias.length ? Math.round(total / dias.length) : 0
  const acima = dias.filter(d => d.v > limiteDia).length
  const hoje = u.today ?? 0
  const pctHoje = Math.min(100, (hoje / limiteDia) * 100)
  const pctMes = Math.min(100, ((u.month ?? 0) / limiteMes) * 100)
  const nivel = paid ? (pctMes >= 80 ? 'bad' : pctMes >= 60 ? 'warn' : 'ok') : (pctHoje >= 80 ? 'bad' : pctHoje >= 60 ? 'warn' : 'ok')
  const corBarra = (v: number) => (paid ? '#6366f1' : v > limiteDia ? '#f43f5e' : v >= limiteDia * 0.8 ? '#f59e0b' : '#6366f1')
  const tetoY = paid ? Math.max(pico?.v ?? 0, 10) * 1.15 : Math.max(pico?.v ?? 0, limiteDia) * 1.15

  return (
    <div className="rounded-2xl border p-4 sm:p-5" style={{
      background: '#151524',
      borderColor: nivel === 'bad' ? 'rgba(244,63,94,0.45)' : nivel === 'warn' ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.07)',
    }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-[13px] font-semibold text-slate-200">Plano da Cloudflare</h3>
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${paid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.06] text-slate-300'}`}>
            {paid ? 'Workers Paid' : 'plano gratuito · 1.000 visitantes por dia'}
          </span>
          <span className="text-[11px] text-slate-500">{periodoLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="text-[11px] font-semibold text-amber-300 hover:underline" onClick={() => setInfo(true)}>por que isso importa?</button>
          {!paid && <a href={CF_PLANS_URL} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-emerald-950 hover:bg-emerald-400">fazer upgrade (US$ 5/mês) →</a>}
        </div>
      </div>

      {!u.available || !per ? (
        <p className="text-xs text-slate-500">O uso aparece aqui depois que o robô começar a receber visitas.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="Visitantes gravados" valor={n(total)} sub={dias.length > 1 ? `em ${dias.length} dias` : diaCurto(dias[0]?.date ?? '')} />
            <Stat label="Média por dia" valor={n(media)} sub={paid ? 'sem limite diário' : `limite: ${n(limiteDia)} por dia`} />
            <Stat label="Dia de pico" valor={n(pico?.v ?? 0)} sub={pico && pico.v > 0 ? diaCurto(pico.date) : 'sem visitas'} tom={!paid && (pico?.v ?? 0) > limiteDia ? 'bad' : undefined} />
            {paid
              ? <Stat label="Uso do mês" valor={`${Math.round(pctMes)}%`} sub={`${n(u.month ?? 0)} de ${n(limiteMes)}`} tom={pctMes >= 80 ? 'bad' : pctMes >= 60 ? 'warn' : 'good'} />
              : <Stat label="Dias acima do limite" valor={`${acima} de ${dias.length}`} sub={acima ? 'passou de 1.000 nesses dias' : 'nenhum dia estourou'} tom={acima ? 'bad' : 'good'} />}
            <Stat label="Hoje" valor={paid ? n(hoje) : `${Math.round(pctHoje)}%`} sub={paid ? 'visitantes gravados' : `${n(hoje)} de ${n(limiteDia)}`} tom={paid ? undefined : pctHoje >= 80 ? 'bad' : pctHoje >= 60 ? 'warn' : 'good'} />
            <Stat label="Robôs ignorados" valor={n(per.robosIgnorados)} sub="não gastaram o plano" tom={per.robosIgnorados ? 'good' : undefined} />
          </div>

          {dias.length > 1 ? (
            <div className="mt-4 h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dias} margin={{ top: 14, right: 4, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={diaCurto} tick={{ fill: '#475569', fontSize: 10.5 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis tick={{ fill: '#475569', fontSize: 10.5 }} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, Math.ceil(tetoY)]} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(v))} />
                  <Tooltip content={<TooltipUso limite={paid ? null : limiteDia} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  {!paid && <ReferenceLine y={limiteDia} stroke="#f43f5e" strokeDasharray="5 4" label={{ value: 'limite grátis: 1.000 por dia', position: 'insideTopRight', fill: '#fda4af', fontSize: 10.5 }} />}
                  <Bar dataKey="v" radius={[3, 3, 0, 0]} maxBarSize={22}>
                    {dias.map(d => <Cell key={d.date} fill={corBarra(d.v)} />)}
                  </Bar>
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
            {!paid && acima > 0 && (
              <p className="text-rose-300">Em {acima} dia(s) passou de 1.000 visitantes. Se a conta estava no plano gratuito nesses dias, as vendas depois do limite chegaram no Facebook sem a origem do anúncio.</p>
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
        </>
      )}

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
