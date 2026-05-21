import { NextResponse } from 'next/server'
import { getAuthenticatedUser, metaFetch } from '../_utils'

type ActionItem = { action_type: string; value: string }

type CampaignInsightsData = {
  spend?: string
  impressions?: string
  clicks?: string
  ctr?: string
  actions?: ActionItem[]
  purchase_roas?: ActionItem[]
}

type CampaignInsights = { data?: CampaignInsightsData[] }

type MetaCampaign = {
  id: string
  name: string
  status: string
  insights?: CampaignInsights
}

type CampaignsResponse = {
  data?: MetaCampaign[]
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')
  const datePreset = searchParams.get('date_preset') ?? 'today'
  const projetoId = searchParams.get('projeto_id')

  console.log('[CAMPAIGNS] account_id:', accountId, 'date_preset:', datePreset, 'projeto_id:', projetoId)

  if (!accountId) {
    return NextResponse.json({ error: 'account_id required' }, { status: 400 })
  }

  const { supabase, user } = await getAuthenticatedUser()
  if (!user) {
    console.log('[CAMPAIGNS] unauthorized - no user')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let query = supabase
    .from('meta_connections')
    .select('access_token, account_id')
    .eq('user_id', user.id)
    .eq('status', 'connected')

  if (projetoId) query = query.eq('projeto_id', projetoId)

  const { data: connection, error: connErr } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  console.log('[CAMPAIGNS] connection found:', !!connection, 'stored account_id:', connection?.account_id, 'requested account_id:', accountId)
  if (connErr) console.error('[CAMPAIGNS] connection error:', connErr)

  if (!connection) {
    return NextResponse.json({ error: 'no_connection' }, { status: 400 })
  }

  try {
    const fields = 'id,name,status,insights{spend,impressions,clicks,ctr,actions,purchase_roas}'
    const path = `/${accountId}/campaigns?fields=${fields}&date_preset=${datePreset}&limit=50`

    console.log('[CAMPAIGNS] fetching Meta API path:', path)
    const raw = await metaFetch<CampaignsResponse>(path, connection.access_token)
    console.log('[CAMPAIGNS] raw campaign count:', raw.data?.length ?? 0)
    console.log('[CAMPAIGNS] raw sample:', JSON.stringify(raw.data?.[0]).slice(0, 400))

    const campaigns = (raw.data ?? []).map(camp => {
      const ins = camp.insights?.data?.[0] ?? {}
      const actions = (ins.actions ?? []) as ActionItem[]
      const purchaseRoas = (ins.purchase_roas ?? []) as ActionItem[]

      const roas = parseFloat(purchaseRoas.find(a => a.action_type === 'omni_purchase')?.value ?? '0')
        || (purchaseRoas[0] ? parseFloat(purchaseRoas[0].value) || 0 : 0)

      const conversions =
        parseFloat(actions.find(a => a.action_type === 'purchase')?.value ?? '0') ||
        parseFloat(actions.find(a => a.action_type === 'omni_purchase')?.value ?? '0') || 0

      const spend = parseFloat(ins.spend ?? '0') || 0
      const impressions = parseInt(ins.impressions ?? '0', 10) || 0
      const clicks = parseInt(ins.clicks ?? '0', 10) || 0

      return {
        id: camp.id,
        name: camp.name,
        status: camp.status as 'ACTIVE' | 'PAUSED',
        spend,
        revenue: Math.round(spend * roas),
        roas,
        cpa: conversions > 0 ? parseFloat((spend / conversions).toFixed(2)) : 0,
        conversions,
        ctr: parseFloat(ins.ctr ?? '0') || 0,
        reach: Math.round(impressions * 0.72),
      }
    })

    console.log('[CAMPAIGNS] returning', campaigns.length, 'campaigns')
    return NextResponse.json({ kind: 'meta-campaign', campaigns })
  } catch (err) {
    console.error('[CAMPAIGNS] erro completo:', err)
    return NextResponse.json({ error: 'meta_api_error', detail: String(err) }, { status: 502 })
  }
}
