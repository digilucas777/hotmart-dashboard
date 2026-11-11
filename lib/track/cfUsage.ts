// Uso da conta Cloudflare do cliente e plano de Workers.
// O limite que mais aperta no plano gratuito são as gravações no KV
// (1.000 por dia, por conta): cada visitante novo é uma gravação.

export const FREE_WRITES_DAY = 1000
export const PAID_WRITES_MONTH = 1_000_000

// today/peak7/month/days = conta inteira (é nela que o limite e a cobrança valem);
// instToday/instMonth = só a instalação (o KV dela), quando vem o namespaceId.
export type CfUsage = {
  today: number
  peak7: number
  month: number
  days: { date: string; v: number }[]
  instToday: number | null
  instMonth: number | null
}

// Cada instalação grava as sessões no próprio KV ("track_sessions_<id da instalação>"),
// então dá pra separar o uso de cada uma dentro da mesma conta.
export async function findKvNamespaceId(token: string, accountId: string, installationId: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces?per_page=100`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
    })
    const j = await r.json()
    const list = (Array.isArray(j?.result) ? j.result : []) as { id: string; title: string }[]
    return list.find(n => n.title === `track_sessions_${installationId}`)?.id ?? null
  } catch {
    return null
  }
}

type KvGroup = { dimensions: { date: string; actionType: string; namespaceId: string }; sum: { requests: number } }

export async function fetchKvWrites(token: string, accountId: string, namespaceId: string | null = null): Promise<CfUsage | null> {
  const today = new Date().toISOString().slice(0, 10) // a Cloudflare zera o limite diário à meia-noite UTC
  const since = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'
  const query = `query($a:String!,$s:Date!,$u:Date!){viewer{accounts(filter:{accountTag:$a}){
    kv: kvOperationsAdaptiveGroups(limit:5000, filter:{date_geq:$s,date_leq:$u,actionType:"write"}){dimensions{date actionType namespaceId} sum{requests}}
  }}}`
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { a: accountId, s: since < monthStart ? since : monthStart, u: today } }),
      signal: AbortSignal.timeout(8000),
    })
    const j = await r.json()
    if (!r.ok || j?.errors) return null
    const groups = (j?.data?.viewer?.accounts?.[0]?.kv ?? []) as KvGroup[]
    const byDay = new Map<string, number>(), instDay = new Map<string, number>()
    for (const g of groups) {
      if (g.dimensions.actionType.toLowerCase() !== 'write') continue
      byDay.set(g.dimensions.date, (byDay.get(g.dimensions.date) ?? 0) + g.sum.requests)
      if (namespaceId && g.dimensions.namespaceId === namespaceId) instDay.set(g.dimensions.date, (instDay.get(g.dimensions.date) ?? 0) + g.sum.requests)
    }
    const last7 = [...byDay.entries()].filter(([d]) => d >= since).sort((a, b) => a[0].localeCompare(b[0]))
    return {
      today: byDay.get(today) ?? 0,
      peak7: last7.reduce((m, [, v]) => Math.max(m, v), 0),
      days: last7.map(([date, v]) => ({ date, v })),
      month: [...byDay.entries()].filter(([d]) => d >= monthStart).reduce((a, [, v]) => a + v, 0),
      instToday: namespaceId ? instDay.get(today) ?? 0 : null,
      instMonth: namespaceId ? [...instDay.entries()].filter(([d]) => d >= monthStart).reduce((a, [, v]) => a + v, 0) : null,
    }
  } catch {
    return null
  }
}

// A Cloudflare só devolve o uso dos últimos 90 dias (conferido em 07/11/2026:
// "cannot request data older than 12w6d").
export const CF_HISTORICO_DIAS = 89

// Visitantes gravados (gravações no KV) por dia UTC, num intervalo de datas
// (AAAA-MM-DD, inclusivo). A Cloudflare conta o limite diário pelo dia UTC.
// Busca em blocos de 30 dias. v = a instalação (com namespaceId) ou a conta; conta = a conta inteira.
export async function fetchKvWritesDays(token: string, accountId: string, since: string, until: string, namespaceId: string | null = null): Promise<{ date: string; v: number; conta: number }[] | null> {
  const query = `query($a:String!,$s:Date!,$u:Date!){viewer{accounts(filter:{accountTag:$a}){
    kv: kvOperationsAdaptiveGroups(limit:5000, filter:{date_geq:$s,date_leq:$u,actionType:"write"}){dimensions{date actionType namespaceId} sum{requests}}
  }}}`
  const dia = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10)
  const byDay = new Map<string, number>(), instDay = new Map<string, number>()
  try {
    for (let ini = since; ini <= until; ini = dia(ini, 30)) {
      const fim = dia(ini, 29) < until ? dia(ini, 29) : until
      const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { a: accountId, s: ini, u: fim } }),
        signal: AbortSignal.timeout(8000),
      })
      const j = await r.json()
      if (!r.ok || j?.errors) return null
      const groups = (j?.data?.viewer?.accounts?.[0]?.kv ?? []) as KvGroup[]
      for (const g of groups) {
        if (g.dimensions.actionType.toLowerCase() !== 'write') continue
        byDay.set(g.dimensions.date, (byDay.get(g.dimensions.date) ?? 0) + g.sum.requests)
        if (namespaceId && g.dimensions.namespaceId === namespaceId) instDay.set(g.dimensions.date, (instDay.get(g.dimensions.date) ?? 0) + g.sum.requests)
      }
    }
  } catch {
    return null
  }
  const out: { date: string; v: number; conta: number }[] = []
  for (let d = since; d <= until; d = dia(d, 1)) {
    const conta = byDay.get(d) ?? 0
    out.push({ date: d, v: namespaceId ? instDay.get(d) ?? 0 : conta, conta })
  }
  return out
}

// Plano de Workers da conta. Só dá pra ler se o token tiver a permissão
// "Cobrança: Ler" (Billing Read); sem ela a Cloudflare responde 403 e o
// plano fica "não sei" (aí vale o que o cliente marcou no painel).
// Conferido com conta real (07/11/2026): o Workers Paid aparece na lista de
// assinaturas com rate_plan.id = "workers_paid" e state "Paid" quando ativo
// ("Expired" depois do downgrade). Os planos grátis de domínio também vêm
// com state "Paid" (preço 0), por isso o filtro é pelo rate_plan.
export async function detectWorkersPaid(token: string, accountId: string): Promise<boolean | null> {
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/subscriptions`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const j = await r.json()
    const subs = (Array.isArray(j?.result) ? j.result : []) as { state?: string; rate_plan?: { id?: string } }[]
    return subs.some(s => s.rate_plan?.id === 'workers_paid' && !/expired|cancel|fail/i.test(String(s.state ?? '')))
  } catch {
    return null
  }
}

// Gravações no KV hora a hora, entre dois instantes (ISO). Com as horas dá
// pra montar o dia no horário de quem está olhando (Brasília), em vez do dia
// UTC da Cloudflare, que vira às 21h de Brasília. A Cloudflare aceita no
// máximo 4 semanas por consulta: busca em blocos de 28 dias.
// conta = a conta inteira; inst = só o KV da instalação (com namespaceId).
export async function fetchKvWritesHours(token: string, accountId: string, startIso: string, endIso: string, namespaceId: string | null = null): Promise<{ t: number; conta: number; inst: number }[] | null> {
  const query = `query($a:String!,$s:Time!,$u:Time!){viewer{accounts(filter:{accountTag:$a}){
    kv: kvOperationsAdaptiveGroups(limit:10000, filter:{datetime_geq:$s,datetime_lt:$u,actionType:"write"}){dimensions{datetimeHour namespaceId} sum{requests}}
  }}}`
  const BLOCO = 28 * 86400000
  const fim = Date.parse(endIso)
  const porHora = new Map<number, { conta: number; inst: number }>()
  try {
    for (let ini = Date.parse(startIso); ini < fim; ini += BLOCO) {
      const ate = Math.min(ini + BLOCO, fim)
      const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { a: accountId, s: new Date(ini).toISOString(), u: new Date(ate).toISOString() } }),
        signal: AbortSignal.timeout(8000),
      })
      const j = await r.json()
      if (!r.ok || j?.errors) return null
      const groups = (j?.data?.viewer?.accounts?.[0]?.kv ?? []) as { dimensions: { datetimeHour: string; namespaceId: string }; sum: { requests: number } }[]
      for (const g of groups) {
        const t = Date.parse(g.dimensions.datetimeHour)
        const x = porHora.get(t) ?? { conta: 0, inst: 0 }
        x.conta += g.sum.requests
        if (namespaceId && g.dimensions.namespaceId === namespaceId) x.inst += g.sum.requests
        porHora.set(t, x)
      }
    }
  } catch {
    return null
  }
  return [...porHora.entries()].sort((a, b) => a[0] - b[0]).map(([t, x]) => ({ t, ...x }))
}
