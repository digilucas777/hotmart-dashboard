export const dynamic = 'force-dynamic'

let cachedToken: { token: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token

  const clientId = process.env.HOTMART_CLIENT_ID
  const clientSecret = process.env.HOTMART_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Hotmart credentials not configured')

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Hotmart auth failed [${res.status}]: ${body}`)
  }

  const data = await res.json()
  cachedToken = { token: data.access_token as string, expiresAt: Date.now() + 60 * 60 * 1000 }
  return cachedToken.token
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const transaction = searchParams.get('transaction')

  if (!transaction) {
    return Response.json({ error: 'transaction is required' }, { status: 400 })
  }

  try {
    const token = await getToken()

    const url = `https://developers.hotmart.com/payments/api/v1/sales/history?transaction=${encodeURIComponent(transaction)}`
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      const body = await res.text()
      return Response.json({ error: `Hotmart API error [${res.status}]: ${body}` }, { status: res.status })
    }

    const data = await res.json()
    const purchase = (data?.items ?? [])[0]
    const origemObj = purchase?.origin
    const origem =
      purchase?.tracking_parameters?.utm_source ??
      purchase?.tracking?.source ??
      (typeof origemObj === 'object' && origemObj !== null
        ? (origemObj.src ?? origemObj.sck ?? null)
        : typeof origemObj === 'string' ? origemObj : null) ??
      null

    return Response.json({ origem })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
