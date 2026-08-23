export const runtime = 'edge'

import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const txId = new URL(request.url).searchParams.get('tx') || 'HP1843544649'
  const clientId = process.env.HOTMART_CLIENT_ID!
  const clientSecret = process.env.HOTMART_CLIENT_SECRET!
  const basic = btoa(`${clientId}:${clientSecret}`)

  const tokenRes = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const tokenText = await tokenRes.text()
  if (!tokenRes.ok) {
    return NextResponse.json({ tokenStatus: tokenRes.status, tokenBody: tokenText.slice(0, 300) })
  }
  const token = JSON.parse(tokenText).access_token

  const commRes = await fetch(`https://developers.hotmart.com/payments/api/v1/sales/commissions?transaction=${encodeURIComponent(txId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const commBody = await commRes.text()

  return NextResponse.json({ tokenStatus: tokenRes.status, commStatus: commRes.status, commBody: commBody.slice(0, 500) })
}
