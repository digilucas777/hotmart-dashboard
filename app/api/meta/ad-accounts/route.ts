import { NextResponse } from 'next/server'
import { getAuthenticatedUser, metaFetch } from '../_utils'

type MetaAdAccountsResponse = {
  data?: {
    id: string
    account_id?: string
    name: string
    currency?: string
    timezone_name?: string
    account_status?: number
    amount_spent?: string
    balance?: string
  }[]
}

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('ad_accounts')
    .select('id, business_manager_id, account_id, meta_account_id, name, currency, timezone_name, account_status')
    .eq('user_id', user.id)
    .order('name')

  return NextResponse.json({ adAccounts: data ?? [] })
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { businessManagerIds?: string[] }
  const businessManagerIds = body.businessManagerIds ?? []

  const { data: connection } = await supabase
    .from('facebook_connections')
    .select('id, access_token')
    .eq('user_id', user.id)
    .eq('status', 'connected')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!connection) return NextResponse.json({ error: 'no_connection' }, { status: 400 })

  const { data: businesses } = await supabase
    .from('business_managers')
    .select('id, bm_id')
    .eq('user_id', user.id)
    .in('id', businessManagerIds)

  if (!businesses?.length) return NextResponse.json({ adAccounts: [] })

  await supabase
    .from('business_managers')
    .update({ selected: false })
    .eq('user_id', user.id)

  await supabase
    .from('business_managers')
    .update({ selected: true })
    .eq('user_id', user.id)
    .in('id', businessManagerIds)

  for (const business of businesses) {
    const response = await metaFetch<MetaAdAccountsResponse>(
      `/${business.bm_id}/owned_ad_accounts?fields=id,account_id,name,currency,timezone_name,account_status,amount_spent,balance&limit=100`,
      connection.access_token,
    )

    if (response.data?.length) {
      await supabase.from('ad_accounts').upsert(
        response.data.map(account => ({
          user_id: user.id,
          business_manager_id: business.id,
          account_id: account.account_id ?? account.id.replace('act_', ''),
          meta_account_id: account.id,
          name: account.name,
          currency: account.currency ?? null,
          timezone_name: account.timezone_name ?? null,
          account_status: account.account_status ?? null,
          metadata: {
            amount_spent: account.amount_spent ?? null,
            balance: account.balance ?? null,
          },
        })),
        { onConflict: 'user_id,meta_account_id' },
      )
    }
  }

  const { data } = await supabase
    .from('ad_accounts')
    .select('id, business_manager_id, account_id, meta_account_id, name, currency, timezone_name, account_status')
    .eq('user_id', user.id)
    .order('name')

  return NextResponse.json({ adAccounts: data ?? [] })
}
