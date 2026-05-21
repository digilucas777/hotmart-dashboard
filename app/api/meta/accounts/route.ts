import { NextResponse } from 'next/server'
import { getAuthenticatedUser, metaFetch } from '../_utils'

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

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: conn } = await supabase
    .from('meta_connections')
    .select('access_token')
    .eq('user_id', user.id)
    .eq('status', 'connected')
    .maybeSingle()

  if (!conn) return NextResponse.json({ error: 'no_connection' }, { status: 401 })

  try {
    const businesses = await metaFetch<BusinessResponse>(
      '/me/businesses?fields=id,name&limit=100',
      conn.access_token,
    )

    const result = await Promise.all(
      (businesses.data ?? []).map(async bm => {
        const accounts = await metaFetch<AdAccountsResponse>(
          `/${bm.id}/owned_ad_accounts?fields=id,name,currency,account_status&limit=100`,
          conn.access_token,
        )
        return {
          id: bm.id,
          name: bm.name,
          ad_accounts: accounts.data ?? [],
        }
      }),
    )

    return NextResponse.json({ businesses: result })
  } catch {
    return NextResponse.json({ error: 'meta_api_error' }, { status: 502 })
  }
}
