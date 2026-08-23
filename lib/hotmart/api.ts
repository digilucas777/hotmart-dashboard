// Consultas à API da Hotmart (fora do fluxo de webhook) — usado tanto pelo
// enriquecimento de "origem" dentro do webhook quanto pela reconciliação
// periódica de vendas disputadas/chargeback (app/api/cron/reconcile-disputed-sales).
// Tenta as 3 contas cadastradas nesta ordem porque a venda pode ter sido
// criada em qualquer uma delas — não há como saber de antemão qual.
export const HOTMART_ACCOUNTS = [
  { id: process.env.HOTMART_CLIENT_ID, secret: process.env.HOTMART_CLIENT_SECRET },
  { id: process.env.HOTMART_CLIENT_ID_2, secret: process.env.HOTMART_CLIENT_SECRET_2 },
  { id: process.env.HOTMART_CLIENT_ID_3, secret: process.env.HOTMART_CLIENT_SECRET_3 },
]

export async function getHotmartToken(clientId: string, clientSecret: string): Promise<string | null> {
  const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) return null
  const { access_token } = await res.json()
  return access_token ?? null
}

export async function fetchSaleItem(token: string, transactionId: string): Promise<any | null> {
  const res = await fetch(
    `https://developers.hotmart.com/payments/api/v1/sales/history?transaction=${encodeURIComponent(transactionId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return null
  const data = await res.json()
  return data?.items?.[0] ?? null
}

export async function fetchSaleFromAnyAccount(transactionId: string): Promise<any | null> {
  for (const account of HOTMART_ACCOUNTS) {
    if (!account.id || !account.secret) continue
    const token = await getHotmartToken(account.id, account.secret)
    if (!token) continue
    const item = await fetchSaleItem(token, transactionId)
    if (item) return item
  }
  return null
}

// Pra checar MUITAS transações na mesma execução (reconciliação periódica) —
// pedir um token novo pra cada conta a cada transação era o motivo real da
// rotina beirar o timeout: com 180 vendas × até 3 contas, isso é até 540
// idas e vindas de autenticação só pra achar em qual conta cada venda está.
// Aqui autentica 1x por conta (as 3, em paralelo) e reaproveita esses tokens
// pra toda transação verificada na mesma execução.
export type HotmartAccountToken = { id: string; secret: string; token: string }

export async function getHotmartAccountTokens(): Promise<HotmartAccountToken[]> {
  const validAccounts = HOTMART_ACCOUNTS.filter((a): a is { id: string; secret: string } => !!a.id && !!a.secret)
  const tokens = await Promise.all(validAccounts.map(a => getHotmartToken(a.id, a.secret)))
  return validAccounts
    .map((a, i) => ({ id: a.id, secret: a.secret, token: tokens[i] }))
    .filter((a): a is HotmartAccountToken => !!a.token)
}

export async function fetchSaleWithTokens(transactionId: string, accounts: HotmartAccountToken[]): Promise<any | null> {
  for (const account of accounts) {
    const item = await fetchSaleItem(account.token, transactionId)
    if (item) return item
  }
  return null
}

export async function fetchCommissionsItem(token: string, transactionId: string): Promise<any | null> {
  const res = await fetch(
    `https://developers.hotmart.com/payments/api/v1/sales/commissions?transaction=${encodeURIComponent(transactionId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      },
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.log(`[fetchCommissionsItem DIAG2] ${transactionId}: status=${res.status} body=${body.slice(0, 200)}`)
    return null
  }
  const data = await res.json()
  return data?.items?.[0] ?? null
}

export async function fetchCommissionsFromAnyAccount(transactionId: string): Promise<any | null> {
  for (const account of HOTMART_ACCOUNTS) {
    if (!account.id || !account.secret) continue
    const token = await getHotmartToken(account.id, account.secret)
    if (!token) continue
    const item = await fetchCommissionsItem(token, transactionId)
    if (item) return item
  }
  return null
}

// Descoberto na prática (2026-08-23): o token cacheado de uma conta pode já
// ter sido invalidado por OUTRO processo que reautenticou a mesma conta
// nesse meio tempo (o webhook recebendo vendas reais, ou o cron de
// reconciliação, rodando em paralelo a este) — a Hotmart parece invalidar o
// token anterior de um client_id assim que um novo é emitido. Por isso, se o
// token cacheado falhar, busca um token novo na hora antes de desistir dessa
// conta.
export async function fetchCommissionsWithTokens(transactionId: string, accounts: HotmartAccountToken[]): Promise<any | null> {
  for (const account of accounts) {
    const item = await fetchCommissionsItem(account.token, transactionId)
    if (item) return item

    const freshToken = await getHotmartToken(account.id, account.secret)
    if (freshToken && freshToken !== account.token) {
      const retryItem = await fetchCommissionsItem(freshToken, transactionId)
      if (retryItem) return retryItem
    }
  }
  return null
}

// Enum de status da Sales History API da Hotmart (developers.hotmart.com) —
// vocabulário DIFERENTE do nome dos eventos de webhook (PURCHASE_APPROVED
// etc). Usado só pra reconciliação: traduz o status "de verdade" (API) pro
// mesmo conjunto de status que a coluna `vendas.status` já usa hoje.
export function mapHotmartApiStatus(apiStatus: string | undefined | null): string {
  const map: Record<string, string> = {
    APPROVED: 'approved',
    COMPLETE: 'approved',
    CANCELLED: 'cancelled',
    CANCELED: 'cancelled',
    EXPIRED: 'cancelled',
    REFUNDED: 'refunded',
    PARTIALLY_REFUNDED: 'refunded',
    CHARGEBACK: 'chargeback',
    PROTESTED: 'disputed',
    DISPUTE: 'disputed',
    BLOCKED: 'pending',
    NO_FUNDS: 'pending',
    OVERDUE: 'pending',
    PRE_ORDER: 'pending',
    PRINTED_BILLET: 'pending',
    PROCESSING_TRANSACTION: 'pending',
    STARTED: 'pending',
    UNDER_ANALISYS: 'pending',
    WAITING_PAYMENT: 'pending',
  }
  return map[String(apiStatus ?? '').toUpperCase()] ?? 'pending'
}
