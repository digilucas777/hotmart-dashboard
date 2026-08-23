export const runtime = 'edge'

import { NextResponse } from 'next/server'

// Descoberto em produção (2026-08-23): a Hotmart recusa (400/401) chamadas a
// /sales/commissions vindas do IP de saída das Serverless Functions da
// Vercel (AWS Lambda) — o MESMO request, com o MESMO token, funciona
// perfeitamente de uma máquina local ou de uma Edge Function da própria
// Vercel (rede diferente, não-AWS). Por isso essa rota roda em Edge runtime:
// é um proxy interno só pra essa chamada específica, usado pelo webhook e
// pelo cron de backfill (que rodam em runtime Node por causa do Supabase).
const HOTMART_ACCOUNTS = [
  { id: process.env.HOTMART_CLIENT_ID, secret: process.env.HOTMART_CLIENT_SECRET },
  { id: process.env.HOTMART_CLIENT_ID_2, secret: process.env.HOTMART_CLIENT_SECRET_2 },
  { id: process.env.HOTMART_CLIENT_ID_3, secret: process.env.HOTMART_CLIENT_SECRET_3 },
]

async function getToken(clientId: string, clientSecret: string): Promise<string | null> {
  const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) return null
  const { access_token } = await res.json()
  return access_token ?? null
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const transactionId = new URL(request.url).searchParams.get('transaction')
  if (!transactionId) return NextResponse.json({ error: 'transaction obrigatório' }, { status: 400 })

  for (const account of HOTMART_ACCOUNTS) {
    if (!account.id || !account.secret) continue
    const token = await getToken(account.id, account.secret)
    if (!token) continue
    const res = await fetch(
      `https://developers.hotmart.com/payments/api/v1/sales/commissions?transaction=${encodeURIComponent(transactionId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (res.ok) {
      const data = await res.json()
      const item = data?.items?.[0] ?? null
      if (item) return NextResponse.json({ item })
    }
  }
  return NextResponse.json({ item: null })
}
