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
    console.log('[ACCOUNTS] buscando businesses via /me/businesses...')
    const businesses = await metaFetch<BusinessResponse>(
      '/me/businesses?fields=id,name&limit=100',
      conn.access_token,
    )
    console.log('[ACCOUNTS] businesses raw:', JSON.stringify(businesses))

    if (businesses.data && businesses.data.length > 0) {
      console.log('[ACCOUNTS] encontrou', businesses.data.length, 'BMs, buscando ad accounts...')
      const result = await Promise.all(
        businesses.data.map(async bm => {
          const accounts = await metaFetch<AdAccountsResponse>(
            `/${bm.id}/owned_ad_accounts?fields=id,name,currency,account_status&limit=100`,
            conn.access_token,
          )
          console.log(`[ACCOUNTS] BM ${bm.id} (${bm.name}): ${accounts.data?.length ?? 0} contas`)
          return {
            id: bm.id,
            name: bm.name,
            ad_accounts: accounts.data ?? [],
          }
        }),
      )
      return NextResponse.json({ businesses: result })
    }

    console.log('[ACCOUNTS] nenhum BM encontrado, tentando /me/adaccounts...')
    const directAccounts = await metaFetch<AdAccountsResponse>(
      '/me/adaccounts?fields=id,name,currency,account_status&limit=100',
      conn.access_token,
    )
    console.log('[ACCOUNTS] adaccounts raw:', JSON.stringify(directAccounts))

    if (directAccounts.data && directAccounts.data.length > 0) {
      console.log('[ACCOUNTS] encontrou', directAccounts.data.length, 'contas diretas')
      return NextResponse.json({
        businesses: [
          {
            id: 'direct',
            name: 'Minhas Contas',
            ad_accounts: directAccounts.data,
          },
        ],
      })
    }

    console.log('[ACCOUNTS] nenhuma conta encontrada em nenhum endpoint')
    return NextResponse.json({ businesses: [] })
  } catch (err) {
    console.error('[ACCOUNTS] erro:', err)
    return NextResponse.json({ error: 'meta_api_error' }, { status: 502 })
  }
}
