// Uso da conta Cloudflare do cliente e plano de Workers.
// O limite que mais aperta no plano gratuito são as gravações no KV
// (1.000 por dia, por conta): cada visitante novo é uma gravação.

export const FREE_WRITES_DAY = 1000
export const PAID_WRITES_MONTH = 1_000_000

export type CfUsage = {
  today: number
  peak7: number
  month: number
  days: { date: string; v: number }[]
}

export async function fetchKvWrites(token: string, accountId: string): Promise<CfUsage | null> {
  const today = new Date().toISOString().slice(0, 10) // a Cloudflare zera o limite diário à meia-noite UTC
  const since = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
  const monthStart = today.slice(0, 8) + '01'
  const query = `query($a:String!,$s:Date!,$u:Date!){viewer{accounts(filter:{accountTag:$a}){
    kv: kvOperationsAdaptiveGroups(limit:100, filter:{date_geq:$s,date_leq:$u}){dimensions{date actionType} sum{requests}}
  }}}`
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { a: accountId, s: since < monthStart ? since : monthStart, u: today } }),
      signal: AbortSignal.timeout(8000),
    })
    const j = await r.json()
    if (!r.ok || j?.errors) return null
    const groups = (j?.data?.viewer?.accounts?.[0]?.kv ?? []) as { dimensions: { date: string; actionType: string }; sum: { requests: number } }[]
    const byDay = new Map<string, number>()
    for (const g of groups) if (g.dimensions.actionType.toLowerCase() === 'write') byDay.set(g.dimensions.date, (byDay.get(g.dimensions.date) ?? 0) + g.sum.requests)
    const last7 = [...byDay.entries()].filter(([d]) => d >= since).sort((a, b) => a[0].localeCompare(b[0]))
    return {
      today: byDay.get(today) ?? 0,
      peak7: last7.reduce((m, [, v]) => Math.max(m, v), 0),
      days: last7.map(([date, v]) => ({ date, v })),
      month: [...byDay.entries()].filter(([d]) => d >= monthStart).reduce((a, [, v]) => a + v, 0),
    }
  } catch {
    return null
  }
}

// Visitantes gravados (gravações no KV) por dia UTC, num intervalo de datas
// (AAAA-MM-DD, inclusivo). A Cloudflare conta o limite diário pelo dia UTC.
export async function fetchKvWritesDays(token: string, accountId: string, since: string, until: string): Promise<{ date: string; v: number }[] | null> {
  const query = `query($a:String!,$s:Date!,$u:Date!){viewer{accounts(filter:{accountTag:$a}){
    kv: kvOperationsAdaptiveGroups(limit:400, filter:{date_geq:$s,date_leq:$u}){dimensions{date actionType} sum{requests}}
  }}}`
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { a: accountId, s: since, u: until } }),
      signal: AbortSignal.timeout(8000),
    })
    const j = await r.json()
    if (!r.ok || j?.errors) return null
    const groups = (j?.data?.viewer?.accounts?.[0]?.kv ?? []) as { dimensions: { date: string; actionType: string }; sum: { requests: number } }[]
    const byDay = new Map<string, number>()
    for (const g of groups) if (g.dimensions.actionType.toLowerCase() === 'write') byDay.set(g.dimensions.date, (byDay.get(g.dimensions.date) ?? 0) + g.sum.requests)
    const out: { date: string; v: number }[] = []
    for (let t = new Date(`${since}T00:00:00Z`); t.toISOString().slice(0, 10) <= until; t = new Date(t.getTime() + 86400000)) {
      const d = t.toISOString().slice(0, 10)
      out.push({ date: d, v: byDay.get(d) ?? 0 })
    }
    return out
  } catch {
    return null
  }
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
