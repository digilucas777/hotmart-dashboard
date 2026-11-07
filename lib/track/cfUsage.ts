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

// Plano de Workers da conta. Só dá pra ler se o token tiver a permissão
// "Faturamento: Ler" (Billing Read); sem ela a Cloudflare responde 403 e o
// plano fica "não sei" (aí vale o que o cliente marcou no painel).
// HIPÓTESE (não confirmada com conta paga real): a assinatura do Workers Paid
// aparece na lista de assinaturas com um id/nome contendo "workers".
export async function detectWorkersPaid(token: string, accountId: string): Promise<boolean | null> {
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/subscriptions`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const j = await r.json()
    const subs = Array.isArray(j?.result) ? j.result : []
    const paid = subs.some((s: Record<string, unknown>) => {
      const txt = JSON.stringify({ rate_plan: s.rate_plan, product: s.product, component_values: s.component_values }).toLowerCase()
      const active = !s.state || /paid|active|trial/i.test(String(s.state))
      return active && /workers[ _-]?(paid|standard|bundled|unbound)/.test(txt)
    })
    return paid
  } catch {
    return null
  }
}
