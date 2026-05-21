import { NextResponse } from 'next/server'
import { metaFetch } from '../_utils'

type BusinessResponse = {
  data?: { id: string; name: string }[]
}

type AdAccountsResponse = {
  data?: {
    id: string
    name: string
    currency?: string
    account_status?: number
  }[]
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const accessToken = searchParams.get('access_token')

  if (!accessToken) {
    return NextResponse.json({ error: 'access_token required' }, { status: 400 })
  }

  try {
    const businesses = await metaFetch<BusinessResponse>(
      '/me/businesses?fields=id,name&limit=100',
      accessToken,
    )

    const result = await Promise.all(
      (businesses.data ?? []).map(async bm => {
        const accounts = await metaFetch<AdAccountsResponse>(
          `/${bm.id}/owned_ad_accounts?fields=id,name,currency,account_status&limit=100`,
          accessToken,
        )
        return {
          bm_id: bm.id,
          bm_name: bm.name,
          ad_accounts: accounts.data ?? [],
        }
      }),
    )

    return NextResponse.json({ businesses: result })
  } catch {
    return NextResponse.json({ error: 'meta_api_error' }, { status: 502 })
  }
}
