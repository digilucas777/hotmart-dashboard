import { NextResponse } from 'next/server'
import { getAuthenticatedUser, metaFetch } from '../_utils'

const RATE = 5.03

type ActionItem = { action_type: string; value: string }

type InsightsData = {
  spend?: string
  impressions?: string
  reach?: string
  frequency?: string
  cpm?: string
  inline_link_clicks?: string
  inline_link_click_ctr?: string
  actions?: ActionItem[]
  action_values?: ActionItem[]
  video_play_actions?: ActionItem[]
  video_p25_watched_actions?: ActionItem[]
}

type InsightsResponse = { data?: InsightsData[] }

function getDateRange(preset: string): { from: Date; to: Date } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const DAY = 86_400_000

  switch (preset) {
    case 'today':
      return { from: today, to: new Date(today.getTime() + DAY) }
    case 'yesterday': {
      const d = new Date(today.getTime() - DAY)
      return { from: d, to: today }
    }
    case 'this_week_sun_today': {
      const d = new Date(today)
      d.setDate(d.getDate() - d.getDay())
      return { from: d, to: new Date(today.getTime() + DAY) }
    }
    case 'last_week_sun_sat': {
      const sun = new Date(today)
      sun.setDate(sun.getDate() - sun.getDay() - 7)
      return { from: sun, to: new Date(sun.getTime() + 7 * DAY) }
    }
    case 'this_month': {
      const d = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: d, to: new Date(today.getTime() + DAY) }
    }
    case 'last_month': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const last = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: first, to: last }
    }
    default:
      return { from: today, to: new Date(today.getTime() + DAY) }
  }
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
    const fields = [
      'spend', 'impressions', 'reach', 'frequency', 'cpm',
      'actions', 'action_values',
      'inline_link_clicks', 'inline_link_click_ctr',
      'video_play_actions', 'video_p25_watched_actions',
    ].join(',')

    const insights = await metaFetch<InsightsResponse>(
      `/${accountId}/insights?fields=${fields}&date_preset=${datePreset}`,
      connection.access_token,
    )

    const raw = insights.data?.[0] ?? {}
    const num = (s?: string) => parseFloat(s ?? '0') || 0
    const int = (s?: string) => parseInt(s ?? '0', 10) || 0
    const actionVal = (arr: ActionItem[] | undefined, type: string) =>
      parseFloat(arr?.find(a => a.action_type === type)?.value ?? '0') || 0
    const actionSum = (arr: ActionItem[] | undefined) =>
      (arr ?? []).reduce((s, a) => s + (parseFloat(a.value) || 0), 0)

    const spend_usd      = num(raw.spend)
    const cpm_usd        = num(raw.cpm)
    const impressions    = int(raw.impressions)
    const cliques_no_link = int(raw.inline_link_clicks)
    const cpc_usd        = cliques_no_link > 0 ? spend_usd / cliques_no_link : 0

    const checkouts         = actionVal(raw.actions, 'initiate_checkout')
    const compras           = actionVal(raw.actions, 'purchase')
    const adicoes_carrinho  = actionVal(raw.actions, 'add_to_cart')
    const vis_pagina        = actionVal(raw.actions, 'landing_page_view')
    const valor_compras_usd = actionVal(raw.action_values, 'purchase')

    const video_plays = actionSum(raw.video_play_actions)
    const video_25    = actionSum(raw.video_p25_watched_actions)
    const hook_rate   = impressions > 0 ? (video_plays / impressions) * 100 : 0
    const connect_rate = cliques_no_link > 0 ? (checkouts / cliques_no_link) * 100 : 0

    // ROAS real: faturamento Hotmart aprovado no período / spend em BRL
    let roas_real = 0
    if (projetoId && spend_usd > 0) {
      const dateRange = getDateRange(datePreset)

      const { data: pp } = await supabase
        .from('projeto_produtos')
        .select('produto_id')
        .eq('projeto_id', projetoId)

      const produtoIds = (pp ?? []).map((r: { produto_id: string }) => r.produto_id)

      if (produtoIds.length > 0) {
        const { data: prods } = await supabase
          .from('produtos')
          .select('hotmart_id')
          .in('id', produtoIds)

        const hotmartIds = (prods ?? []).map((r: { hotmart_id: string }) => r.hotmart_id)

        if (hotmartIds.length > 0) {
          const { data: vendas } = await supabase
            .from('vendas')
            .select('valor_operacional_final')
            .in('hotmart_produto_id', hotmartIds)
            .eq('status', 'approved')
            .gte('data_venda', dateRange.from.toISOString())
            .lt('data_venda', dateRange.to.toISOString())

          const faturamento = (vendas ?? []).reduce(
            (sum: number, v: { valor_operacional_final: number }) => sum + (v.valor_operacional_final ?? 0),
            0,
          )
          const spend_brl = spend_usd * RATE
          roas_real = spend_brl > 0 ? faturamento / spend_brl : 0
        }
      }
    }

    return NextResponse.json({
      spend_usd,          spend_brl:          spend_usd        * RATE,
      cpm_usd,            cpm_brl:            cpm_usd          * RATE,
      cpc_usd,            cpc_brl:            cpc_usd          * RATE,
      valor_compras_usd,  valor_compras_brl:  valor_compras_usd * RATE,
      impressions,
      alcance:            int(raw.reach),
      frequencia:         num(raw.frequency),
      cliques_no_link,
      ctr:                num(raw.inline_link_click_ctr),
      checkouts,
      compras,
      adicoes_carrinho,
      vis_pagina,
      video_plays,
      video_25,
      hook_rate,
      connect_rate,
      roas_real,
      actions: raw.actions ?? [],
    })
  } catch (err) {
    console.error('[INSIGHTS] erro:', err)
    return NextResponse.json({ error: 'meta_api_error' }, { status: 502 })
  }
}
