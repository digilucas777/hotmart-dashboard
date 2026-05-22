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

type CampaignsResponse = { data?: MetaCampaign[] }

type Campaign = {
  id: string
  name: string
  account_name: string
  status: 'ACTIVE' | 'PAUSED'
  spend: number
  revenue: number
  roas: number
  cpa: number
  conversions: number
  ctr: number
  reach: number
}

async function fetchAccountCampaigns(
  accountId: string,
  accountName: string,
  accessToken: string,
  datePreset: string,
): Promise<Campaign[]> {
  const fields = 'id,name,status,insights{spend,impressions,clicks,ctr,actions,purchase_roas}'
  const path = `/${accountId}/campaigns?fields=${fields}&date_preset=${datePreset}&limit=50`
  console.log('[CAMPAIGNS] fetching account:', accountId)

  const raw = await metaFetch<CampaignsResponse>(path, accessToken)
  console.log('[CAMPAIGNS] account', accountId, ':', raw.data?.length ?? 0, 'campaigns')

  return (raw.data ?? []).map(camp => {
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

    return {
      id: camp.id,
      name: camp.name,
      account_name: accountName,
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
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const legacyAccountId = searchParams.get('account_id')
  const datePreset      = searchParams.get('date_preset') ?? 'today'
  const projetoId       = searchParams.get('projeto_id')

  console.log('[CAMPAIGNS] date_preset:', datePreset, 'projeto_id:', projetoId, 'legacy_account_id:', legacyAccountId)

  const { supabase, user } = await getAuthenticatedUser()
  if (!user) {
    console.log('[CAMPAIGNS] unauthorized - no user')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: connection } = await supabase
    .from('meta_connections')
    .select('access_token')
    .eq('user_id', user.id)
    .eq('status', 'connected')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!connection) return NextResponse.json({ error: 'no_connection' }, { status: 400 })

  let accountEntries: { id: string; name: string }[] = []
  if (projetoId) {
    const { data: pa } = await supabase
      .from('meta_project_accounts')
      .select('account_id, account_name')
      .eq('projeto_id', projetoId)
    accountEntries = (pa ?? []).map((r: { account_id: string; account_name: string | null }) => ({
      id: r.account_id,
      name: r.account_name ?? r.account_id,
    }))
    console.log('[CAMPAIGNS] meta_project_accounts found:', accountEntries.length, 'accounts')
  }
  if (accountEntries.length === 0 && legacyAccountId) {
    accountEntries = [{ id: legacyAccountId, name: legacyAccountId }]
    console.log('[CAMPAIGNS] fallback to legacy account_id')
  }
  if (accountEntries.length === 0) return NextResponse.json({ error: 'no_accounts' }, { status: 400 })

  try {
    const perAccount = await Promise.all(
      accountEntries.map(entry => fetchAccountCampaigns(entry.id, entry.name, connection.access_token, datePreset)),
    )

    const campaigns = perAccount
      .flat()
      .sort((a, b) => b.roas - a.roas)

    console.log('[CAMPAIGNS] returning', campaigns.length, 'campaigns from', accountEntries.length, 'account(s)')
    return NextResponse.json({ kind: 'meta-campaign', campaigns })
  } catch (err) {
    console.error('[CAMPAIGNS] erro completo:', err)
    return NextResponse.json({ error: 'meta_api_error', detail: String(err) }, { status: 502 })
  }
}
