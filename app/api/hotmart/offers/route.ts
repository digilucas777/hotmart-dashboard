export const dynamic = 'force-dynamic'

async function getToken(): Promise<string> {
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
  return data.access_token as string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('product_id')

  if (!productId) {
    return Response.json({ error: 'product_id is required' }, { status: 400 })
  }

  try {
    const token = await getToken()

    const url = `https://developers.hotmart.com/products/api/v1/product/${productId}/offers`
    console.log('[hotmart/offers] product_id recebido:', productId)
    console.log('[hotmart/offers] URL chamada:', url)

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    })

    console.log('[hotmart/offers] status da resposta:', res.status)

    if (!res.ok) {
      const body = await res.text()
      console.log('[hotmart/offers] body da resposta (erro):', body)
      return Response.json({ error: `Hotmart API error [${res.status}]: ${body}` }, { status: res.status })
    }

    const data = await res.json()
    console.log('[hotmart/offers] body completo da resposta:', JSON.stringify(data, null, 2))

    const offers = ((data as any[]) ?? []).map((offer: any) => ({
      code: offer.code ?? offer.offer_code ?? '',
      name: offer.name ?? offer.offer_name ?? '',
      price: offer.price?.value ?? offer.full_price?.value ?? null,
      currency: offer.price?.currency_code ?? offer.full_price?.currency_code ?? 'BRL',
    })).filter((o: { code: string }) => o.code)

    return Response.json({ offers })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
