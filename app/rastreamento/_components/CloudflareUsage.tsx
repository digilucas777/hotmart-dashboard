'use client'

import { useEffect, useState } from 'react'
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

type Periodo = { dias: { date: string; v: number }[]; robosIgnorados: number; robosAntesDaCorrecao: number }
type Usage = { available: boolean; paid: boolean; detected: boolean | null; today?: number; peak7?: number; month?: number; limitDay?: number; limitMonth?: number; periodo?: Periodo | null }

const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

// Barra de uso: visitantes gravados hoje (gratuito) ou no mês (Workers Paid).
// Com start/end (o período escolhido no painel), mostra o uso desse período
// e os robôs ignorados nele.
export function UsageBar({ installationId, compact = false, label, start, end, periodoLabel }: {
  installationId: string; compact?: boolean; label?: string; start?: string; end?: string; periodoLabel?: string
}) {
  const [u, setU] = useState<Usage | null>(null)
  const [info, setInfo] = useState(false)

  useEffect(() => {
    let alive = true
    const q = new URLSearchParams({ id: installationId })
    if (start && end) { q.set('start', start); q.set('end', end) }
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
  const per = u.periodo ?? null
  const dias = per?.dias ?? []
  const totalPeriodo = dias.reduce((a, d) => a + d.v, 0)
  const maiorDia = dias.reduce<{ date: string; v: number } | null>((m, d) => (!m || d.v > m.v ? d : m), null)
  const umDia = dias.length === 1
  // Plano gratuito: o limite é por dia, então num período de vários dias a
  // barra mostra o dia que mais gastou. Workers Paid: limite do mês.
  const used = paid ? u.month ?? 0 : per ? (umDia ? dias[0].v : maiorDia?.v ?? 0) : u.today ?? 0
  const limit = paid ? u.limitMonth ?? 1_000_000 : u.limitDay ?? 1000
  const pct = Math.min(100, (used / limit) * 100)
  const peakPct = paid || per ? 0 : Math.min(100, ((u.peak7 ?? 0) / limit) * 100)
  const level = pct >= 80 ? 'bad' : pct >= 60 || peakPct >= 80 ? 'warn' : 'ok'
  const atLimit = pct >= 100
  const titulo = paid
    ? 'visitantes gravados no mês'
    : !per ? 'visitantes gravados hoje'
    : umDia ? `visitantes gravados ${periodoLabel ?? `em ${diaCurto(dias[0].date)}`}`
    : `dia que mais gravou ${periodoLabel ? `(${periodoLabel})` : 'no período'}${maiorDia && maiorDia.v > 0 ? `: ${diaCurto(maiorDia.date)}` : ''}`

  return (
    <div className={`cf-usage ${level}${compact ? ' compact' : ''}`}>
      <div className="cf-u-head">
        <span>{label ? <b className="cf-u-name">{label}</b> : null}{titulo} · {paid ? 'Workers Paid' : 'plano gratuito'}</span>
        <b>{used.toLocaleString('pt-BR')} <small>de {limit.toLocaleString('pt-BR')}</small></b>
      </div>
      {u.available
        ? <span className="cf-bar"><i style={{ width: `${Math.max(2, pct)}%` }} /></span>
        : <span className="cf-u-note">O uso aparece aqui depois que o robô começar a receber visitas.</span>}
      {u.available && per && !umDia && (
        <span className="cf-u-days" aria-label="visitantes gravados por dia">
          {dias.map(d => (
            <i key={d.date} title={`${diaCurto(d.date)}: ${d.v.toLocaleString('pt-BR')}`}
              className={!paid && d.v >= limit ? 'bad' : !paid && d.v >= limit * 0.8 ? 'warn' : ''}
              style={{ height: `${Math.max(6, Math.min(100, (d.v / Math.max(paid ? maiorDia?.v || 1 : limit, 1)) * 100))}%` }} />
          ))}
        </span>
      )}
      {u.available && (
        <span className="cf-u-note">
          {per && !umDia && <>total no período: {totalPeriodo.toLocaleString('pt-BR')}{!paid && ' · o limite do plano gratuito é por dia (dia em horário de Londres)'}</>}
          {per && umDia && !paid && <>o dia da Cloudflare vai da meia-noite à meia-noite de Londres (21h de Brasília)</>}
          {per && umDia && paid && <>no período: {totalPeriodo.toLocaleString('pt-BR')}</>}
          {!per && !paid && <>pico dos últimos 7 dias: {(u.peak7 ?? 0).toLocaleString('pt-BR')} por dia</>}
          {!paid && atLimit && <> · <b>limite do plano gratuito atingido: as próximas vendas desse dia chegaram sem a origem do anúncio.</b></>}
          {!paid && !atLimit && pct >= 80 && <> · <b>perto do limite do plano gratuito.</b></>}
          {!paid && pct < 80 && peakPct >= 80 && <> · nos últimos dias passou perto do limite do plano gratuito.</>}
        </span>
      )}
      {per && (per.robosIgnorados > 0 || per.robosAntesDaCorrecao > 0) && (
        <span className="cf-u-bots">
          🤖 <b>{per.robosIgnorados.toLocaleString('pt-BR')}</b> acesso(s) de robô ignorado(s) no período: não foram pro Facebook nem gastaram o plano.
          {per.robosAntesDaCorrecao > 0 && <> Outros {per.robosAntesDaCorrecao.toLocaleString('pt-BR')} chegaram antes da correção de 07/11 e foram contados.</>}
        </span>
      )}
      <div className="cf-u-act">
        {!paid && <a href={CF_PLANS_URL} target="_blank" rel="noopener noreferrer" className="cf-up">fazer upgrade (US$ 5/mês) →</a>}
        <button type="button" className="cf-link" onClick={() => setInfo(true)}>por que isso importa?</button>
        {u.detected === null
          ? <label className="cf-chk"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} />minha conta já está no Workers Paid</label>
          : <span className="cf-chk">plano reconhecido automaticamente</span>}
      </div>
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
