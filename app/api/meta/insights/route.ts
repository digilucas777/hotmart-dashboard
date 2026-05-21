import { NextResponse } from 'next/server'
import { getAuthenticatedUser, metaFetch } from '../_utils'

const RATE = 5.03

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
  cpc?: string
  frequency?: string
  actions?: Action[]
}

type InsightsResponse = {
  data?: InsightsData[]
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

  if (projetoId) {
    query = query.eq('projeto_id', projetoId)
  }

  const { data: connection } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (!connection) {
    return NextResponse.json({ error: 'no_connection' }, { status: 400 })
  }

  try {
    const insights = await metaFetch<InsightsResponse>(
      `/${accountId}/insights?fields=spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions&date_preset=${datePreset}`,
      connection.access_token,
    )

    const raw = insights.data?.[0] ?? {}
    const actions = (raw.actions ?? []) as Action[]

    const num = (s?: string) => parseFloat(s ?? '0') || 0
    const int = (s?: string) => parseInt(s ?? '0', 10) || 0
    const actionVal = (type: string) =>
      parseFloat(actions.find(a => a.action_type === type)?.value ?? '0') || 0

    const spend_usd = num(raw.spend)
    const cpm_usd   = num(raw.cpm)
    const cpc_usd   = num(raw.cpc)

    const leads     = actionVal('lead')
    const purchases = actionVal('purchase')
    const conversions    = actionVal('offsite_conversion.fb_pixel_purchase')
    const checkouts      = actionVal('initiate_checkout')
    const add_to_cart    = actionVal('add_to_cart')
    const page_views     = actionVal('landing_page_view')

    const cpl_usd = leads > 0     ? spend_usd / leads     : 0
    const cpa_usd = purchases > 0 ? spend_usd / purchases : 0

    return NextResponse.json({
      spend_usd,   spend_brl:   spend_usd * RATE,
      cpm_usd,     cpm_brl:     cpm_usd   * RATE,
      cpc_usd,     cpc_brl:     cpc_usd   * RATE,
      cpl_usd,     cpl_brl:     cpl_usd   * RATE,
      cpa_usd,     cpa_brl:     cpa_usd   * RATE,
      impressions: int(raw.impressions),
      reach:       int(raw.reach),
      clicks:      int(raw.clicks),
      ctr:         num(raw.ctr),
      frequency:   num(raw.frequency),
      leads,
      purchases,
      conversions,
      checkouts,
      add_to_cart,
      page_views,
      actions,
    })
  } catch (err) {
    console.error('[INSIGHTS] erro:', err)
    return NextResponse.json({ error: 'meta_api_error' }, { status: 502 })
  }
}
