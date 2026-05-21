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

type AdsResponse = {
  data?: MetaAd[]
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')
  const datePreset = searchParams.get('date_preset') ?? 'today'
  const projetoId = searchParams.get('projeto_id')

  if (!accountId) {
    return NextResponse.json({ error: 'account_id required' }, { status: 400 })
  }

  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let query = supabase
    .from('meta_connections')
    .select('access_token')
    .eq('user_id', user.id)
    .eq('status', 'connected')

  if (projetoId) query = query.eq('projeto_id', projetoId)

  const { data: connection } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!connection) return NextResponse.json({ error: 'no_connection' }, { status: 400 })

  try {
    const insightFields = 'spend,impressions,clicks,ctr,actions,purchase_roas'
    const creativeFields = 'thumbnail_url,image_url,video_id'
    const filtering = encodeURIComponent(JSON.stringify([
      { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
    ]))

    const path = `/${accountId}/ads?fields=id,name,status,creative{${creativeFields}},insights{${insightFields}}&date_preset=${datePreset}&filtering=${filtering}&limit=50`

    const adsData = await metaFetch<AdsResponse>(path, connection.access_token)

    const creatives = (adsData.data ?? []).map(ad => {
      const ins = ad.insights?.data?.[0] ?? {}
      const actions = (ins.actions ?? []) as ActionItem[]
      const purchaseRoas = (ins.purchase_roas ?? []) as ActionItem[]

      const actionVal = (type: string) =>
        parseFloat(actions.find(a => a.action_type === type)?.value ?? '0') || 0

      const roas = parseFloat(purchaseRoas.find(a => a.action_type === 'omni_purchase')?.value ?? '0')
        || (purchaseRoas[0] ? parseFloat(purchaseRoas[0].value) || 0 : 0)

      const adType = ad.creative?.video_id ? 'video' as const : 'image' as const
      const thumbnailUrl = ad.creative?.thumbnail_url ?? ad.creative?.image_url ?? undefined

      return {
        id: ad.id,
        name: ad.name,
        adType,
        thumbnailUrl,
        ctr: parseFloat(ins.ctr ?? '0') || 0,
        roas,
        spend: parseFloat(ins.spend ?? '0') || 0,
        impressions: parseInt(ins.impressions ?? '0', 10) || 0,
        clicks: parseInt(ins.clicks ?? '0', 10) || 0,
        conversions: actionVal('purchase'),
      }
    }).sort((a, b) => b.roas - a.roas)

    return NextResponse.json({ kind: 'meta-creative', sortBy: 'roas', creatives })
  } catch (err) {
    console.error('[ADS] erro:', err)
    return NextResponse.json({ error: 'meta_api_error' }, { status: 502 })
  }
}
