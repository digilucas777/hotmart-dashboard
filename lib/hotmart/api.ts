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

export async function fetchCommissionsItem(token: string, transactionId: string): Promise<any | null> {
  const res = await fetch(
    `https://developers.hotmart.com/payments/api/v1/sales/commissions?transaction=${encodeURIComponent(transactionId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return null
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
