import { NextResponse } from 'next/server'
import { getAuthenticatedUser, metaFetch } from '../_utils'

type Action = {
  action_type: string
  value: string
}

type InsightsData = {
  spend?: string
  impressions?: string
  reach?: string
  clicks?: string
  ctr?: string
  cpm?: string
  actions?: Action[]
}

type InsightsResponse = {
  data?: InsightsData[]
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')
  const datePreset = searchParams.get('date_preset') ?? 'today'

  if (!accountId) {
    return NextResponse.json({ error: 'account_id required' }, { status: 400 })
  }

  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: connection } = await supabase
    .from('facebook_connections')
    .select('access_token')
    .eq('user_id', user.id)
    .eq('status', 'connected')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!connection) {
    return NextResponse.json({ error: 'no_connection' }, { status: 400 })
  }

  try {
    const insights = await metaFetch<InsightsResponse>(
      `/${accountId}/insights?fields=spend,impressions,reach,clicks,ctr,cpm,actions&date_preset=${datePreset}`,
      connection.access_token,
    )

    const raw = insights.data?.[0] ?? {}

    return NextResponse.json({
      spend: raw.spend ?? '0',
      impressions: raw.impressions ?? '0',
      reach: raw.reach ?? '0',
      clicks: raw.clicks ?? '0',
      ctr: raw.ctr ?? '0',
      cpm: raw.cpm ?? '0',
      actions: raw.actions ?? [],
    })
  } catch {
    return NextResponse.json({ error: 'meta_api_error' }, { status: 502 })
  }
}
