import { NextResponse } from 'next/server'
import { getAuthenticatedUser, metaFetch } from '../_utils'

type ActionItem = { action_type: string; value: string }

type AdCreative = {
  thumbnail_url?: string
  image_url?: string
  video_id?: string | null
}

type AdInsightsData = {
  spend?: string
  impressions?: string
  clicks?: string
  ctr?: string
  actions?: ActionItem[]
  purchase_roas?: ActionItem[]
}

type AdInsights = { data?: AdInsightsData[] }

type MetaAd = {
  id: string
  name: string
  status: string
  creative?: AdCreative
  insights?: AdInsights
}

type AdsResponse = { data?: MetaAd[] }

type Creative = {
  id: string
  name: string
  adType: 'video' | 'image'
  thumbnailUrl?: string
  ctr: number
  roas: number
  spend: number
  impressions: number
  clicks: number
  conversions: number
}

async function fetchAccountAds(
  accountId: string,
  accessToken: string,
  datePreset: string,
): Promise<Creative[]> {
  const insightFields = 'spend,impressions,clicks,ctr,actions,purchase_roas'
  const creativeFields = 'thumbnail_url,image_url,video_id'
  const filtering = encodeURIComponent(JSON.stringify([
    { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
  ]))

  const path = `/${accountId}/ads?fields=id,name,status,creative{${creativeFields}},insights{${insightFields}}&date_preset=${datePreset}&filtering=${filtering}&limit=50`
  const adsData = await metaFetch<AdsResponse>(path, accessToken)

  return (adsData.data ?? []).map(ad => {
    const ins = ad.insights?.data?.[0] ?? {}
    const actions = (ins.actions ?? []) as ActionItem[]
    const purchaseRoas = (ins.purchase_roas ?? []) as ActionItem[]

    const actionVal = (type: string) =>
      parseFloat(actions.find(a => a.action_type === type)?.value ?? '0') || 0

    const roas = parseFloat(purchaseRoas.find(a => a.action_type === 'omni_purchase')?.value ?? '0')
      || (purchaseRoas[0] ? parseFloat(purchaseRoas[0].value) || 0 : 0)

    return {
      id: ad.id,
      name: ad.name,
      adType: ad.creative?.video_id ? 'video' as const : 'image' as const,
      thumbnailUrl: ad.creative?.thumbnail_url ?? ad.creative?.image_url ?? undefined,
      ctr: parseFloat(ins.ctr ?? '0') || 0,
      roas,
      spend: parseFloat(ins.spend ?? '0') || 0,
      impressions: parseInt(ins.impressions ?? '0', 10) || 0,
      clicks: parseInt(ins.clicks ?? '0', 10) || 0,
      conversions: actionVal('purchase'),
    }
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const legacyAccountId = searchParams.get('account_id')
  const datePreset      = searchParams.get('date_preset') ?? 'today'
  const projetoId       = searchParams.get('projeto_id')

  console.log('[ADS] date_preset:', datePreset, 'projeto_id:', projetoId, 'legacy_account_id:', legacyAccountId)

  const { supabase, user } = await getAuthenticatedUser()
  if (!user) {
    console.log('[ADS] unauthorized - no user')
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

  let accountIds: string[] = []
  if (projetoId) {
    const { data: pa } = await supabase
      .from('meta_project_accounts')
      .select('account_id')
      .eq('projeto_id', projetoId)
    accountIds = (pa ?? []).map((r: { account_id: string }) => r.account_id)
    console.log('[ADS] meta_project_accounts found:', accountIds.length, 'accounts')
  }
  if (accountIds.length === 0 && legacyAccountId) {
    accountIds = [legacyAccountId]
    console.log('[ADS] fallback to legacy account_id')
  }
  if (accountIds.length === 0) return NextResponse.json({ error: 'no_accounts' }, { status: 400 })

  try {
    const perAccount = await Promise.all(
      accountIds.map(aid => fetchAccountAds(aid, connection.access_token, datePreset)),
    )

    const creatives = perAccount
      .flat()
      .sort((a, b) => b.roas - a.roas)

    console.log('[ADS] returning', creatives.length, 'creatives from', accountIds.length, 'account(s)')
    return NextResponse.json({ kind: 'meta-creative', sortBy: 'roas', creatives })
  } catch (err) {
    console.error('[ADS] erro completo:', err)
    return NextResponse.json({ error: 'meta_api_error', detail: String(err) }, { status: 502 })
  }
}
