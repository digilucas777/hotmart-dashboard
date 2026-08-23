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
  const rawText = await res.text()
  const { access_token } = JSON.parse(rawText)
  const tokenInRawText = access_token ? rawText.includes(access_token) : false
  console.log(`[getHotmartToken DIAG] access_token len=${access_token?.length} tail=${access_token?.slice(-20)} presenteIntactoNoRawText=${tokenInRawText}`)
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
export type HotmartAccountToken = { token: string }

export async function getHotmartAccountTokens(): Promise<HotmartAccountToken[]> {
  const tokens = await Promise.all(
    HOTMART_ACCOUNTS
      .filter((a): a is { id: string; secret: string } => !!a.id && !!a.secret)
      .map(a => getHotmartToken(a.id, a.secret)),
  )
  return tokens.filter((t): t is string => !!t).map(token => ({ token }))
}

export async function fetchSaleWithTokens(transactionId: string, accounts: HotmartAccountToken[]): Promise<any | null> {
  for (const account of accounts) {
    const item = await fetchSaleItem(account.token, transactionId)
    if (item) return item
  }
  return null
}

// Descoberto na prática (2026-08-23): sob carga concorrente, /sales/commissions
// às vezes devolve 400 "invalid_parameter" pra uma chamada idêntica a uma que
// funciona segundos depois (confirmado: mesma transação, mesmo token válido,
// retry manual bem-sucedido logo em seguida) — parece um rate-limit da própria
// Hotmart disfarçado de erro de parâmetro, não um erro de verdade. 3 tentativas
// com pequeno espaçamento cobre isso sem atrasar demais quem chama em lote.
export async function fetchCommissionsItem(token: string, transactionId: string): Promise<any | null> {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const res = await fetch(
      `https://developers.hotmart.com/payments/api/v1/sales/commissions?transaction=${encodeURIComponent(transactionId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (res.ok) {
      const data = await res.json()
      return data?.items?.[0] ?? null
    }
    const body = await res.text().catch(() => '')
    console.log(`[fetchCommissionsItem DIAG] ${transactionId} tentativa=${tentativa} tokenLen=${token.length} token=${token.slice(0, 8)}...${token.slice(-8)}: status=${res.status} body=${body.slice(0, 200)}`)
    if (tentativa < 3) await new Promise(resolve => setTimeout(resolve, tentativa * 800))
  }
  return null
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

// Mesmo motivo do fetchSaleWithTokens: reaproveita tokens já obtidos em vez
// de autenticar de novo pra cada transação — usado pelo backfill de vendas
// em moeda exótica com coprodução (app/api/cron/backfill-exotic-commissions).
export async function fetchCommissionsWithTokens(transactionId: string, accounts: HotmartAccountToken[]): Promise<any | null> {
  for (const account of accounts) {
    const item = await fetchCommissionsItem(account.token, transactionId)
    if (item) return item
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
