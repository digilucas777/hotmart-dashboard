import { NextResponse } from 'next/server'
import { getAuthenticatedUser, metaFetch } from '../_utils'

const CACHE_TTL = 30 * 60 * 1000

type ActionItem = { action_type: string; value: string }

type InsightsData = {
  spend?: string
  impressions?: string
  reach?: string
  frequency?: string
  inline_link_clicks?: string
  inline_link_click_ctr?: string
  actions?: ActionItem[]
  action_values?: ActionItem[]
  purchase_roas?: ActionItem[]
  video_play_actions?: ActionItem[]
  video_p25_watched_actions?: ActionItem[]
}

type InsightsResponse = { data?: InsightsData[] }

type RawTotals = {
  spend_usd: number
  impressions: number
  alcance: number
  cliques_no_link: number
  checkouts: number
  compras: number
  adicoes_carrinho: number
  vis_pagina: number
  valor_compras_usd: number
  video_plays: number
  video_25: number
}

// Server runs in UTC; vendas are saved in UTC-3 (Brasília). Offset = +3h to UTC.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000

function getDateRange(preset: string): { from: Date; to: Date } {
  const now = new Date()
  // Shift now to BRT to compute the correct calendar day
  const nowBRT = new Date(now.getTime() - BRT_OFFSET_MS)
  const y = nowBRT.getUTCFullYear()
  const m = nowBRT.getUTCMonth()
  const d = nowBRT.getUTCDate()
  // Midnight BRT expressed as UTC (00:00 BRT = 03:00 UTC)
  const todayBRT = new Date(Date.UTC(y, m, d) + BRT_OFFSET_MS)
  const DAY = 86_400_000

  let result: { from: Date; to: Date }

  switch (preset) {
    case 'today':
      result = { from: todayBRT, to: new Date(todayBRT.getTime() + DAY) }; break
    case 'yesterday':
      result = { from: new Date(todayBRT.getTime() - DAY), to: todayBRT }; break
    case 'this_week_sun_today': {
      const dow = nowBRT.getUTCDay()
      result = { from: new Date(todayBRT.getTime() - dow * DAY), to: new Date(todayBRT.getTime() + DAY) }; break
    }
    case 'last_week_sun_sat': {
      const dow = nowBRT.getUTCDay()
      const thisSun = new Date(todayBRT.getTime() - dow * DAY)
      result = { from: new Date(thisSun.getTime() - 7 * DAY), to: thisSun }; break
    }
    case 'this_week_mon_today': {
      const dow = nowBRT.getUTCDay()
      const daysFromMon = dow === 0 ? 6 : dow - 1
      result = { from: new Date(todayBRT.getTime() - daysFromMon * DAY), to: new Date(todayBRT.getTime() + DAY) }; break
    }
    case 'last_week_mon_sun': {
      const dow = nowBRT.getUTCDay()
      const daysFromMon = dow === 0 ? 6 : dow - 1
      const thisMon = new Date(todayBRT.getTime() - daysFromMon * DAY)
      result = { from: new Date(thisMon.getTime() - 7 * DAY), to: thisMon }; break
    }
    case 'last_7d':
      result = { from: new Date(todayBRT.getTime() - 6 * DAY), to: new Date(todayBRT.getTime() + DAY) }; break
    case 'last_30d':
      result = { from: new Date(todayBRT.getTime() - 29 * DAY), to: new Date(todayBRT.getTime() + DAY) }; break
    case 'this_month': {
      const monthStart = new Date(Date.UTC(y, m, 1) + BRT_OFFSET_MS)
      result = { from: monthStart, to: new Date(todayBRT.getTime() + DAY) }; break
    }
    case 'last_month': {
      const firstThisMonth = new Date(Date.UTC(y, m, 1) + BRT_OFFSET_MS)
      const firstLastMonth = new Date(Date.UTC(y, m - 1, 1) + BRT_OFFSET_MS)
      result = { from: firstLastMonth, to: firstThisMonth }; break
    }
    default:
      result = { from: todayBRT, to: new Date(todayBRT.getTime() + DAY) }
  }

  console.log('[DATE_RANGE] preset:', preset, 'from:', result.from, 'to:', result.to)
  return result
}

async function fetchAccountInsights(
  accountId: string,
  accessToken: string,
  datePreset: string,
): Promise<RawTotals> {
  const fields = [
    'spend', 'impressions', 'reach',
    'actions', 'action_values', 'purchase_roas',
    'inline_link_clicks', 'inline_link_click_ctr',
    'video_play_actions', 'video_p25_watched_actions',
  ].join(',')

  const insights = await metaFetch<InsightsResponse>(
    `/${accountId}/insights?fields=${fields}&date_preset=${datePreset}`,
    accessToken,
  )

  const raw = insights.data?.[0] ?? {}
  const num = (s?: string) => parseFloat(s ?? '0') || 0
  const int = (s?: string) => parseInt(s ?? '0', 10) || 0
  const actionVal = (arr: ActionItem[] | undefined, type: string) =>
    parseFloat(arr?.find(a => a.action_type === type)?.value ?? '0') || 0
  const actionSum = (arr: ActionItem[] | undefined) =>
    (arr ?? []).reduce((s, a) => s + (parseFloat(a.value) || 0), 0)

  return {
    spend_usd:        num(raw.spend),
    impressions:      int(raw.impressions),
    alcance:          int(raw.reach),
    cliques_no_link:  int(raw.inline_link_clicks),
    checkouts:        actionVal(raw.actions, 'initiate_checkout'),
    compras:          actionVal(raw.actions, 'purchase'),
    adicoes_carrinho: actionVal(raw.actions, 'add_to_cart'),
    vis_pagina:       actionVal(raw.actions, 'landing_page_view'),
    valor_compras_usd: actionVal(raw.action_values, 'purchase'),
    video_plays:      actionSum(raw.video_play_actions),
    video_25:         actionSum(raw.video_p25_watched_actions),
  }
}

export async function GET(_request: Request) {
  const { searchParams } = new URL(_request.url)
  const legacyAccountId = searchParams.get('account_id')
  const datePreset      = searchParams.get('date_preset') ?? 'today'
  const projetoId       = searchParams.get('projeto_id')

  if (!projetoId && !legacyAccountId) {
    return NextResponse.json({ error: 'projeto_id required' }, { status: 400 })
  }

  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Cache check
  if (projetoId) {
    const { data: cached } = await supabase
      .from('meta_insights_cache')
      .select('data, updated_at')
      .eq('projeto_id', projetoId)
      .eq('date_preset', datePreset)
      .maybeSingle()

    if (cached) {
      const age = Date.now() - new Date(cached.updated_at as string).getTime()
      if (age < CACHE_TTL) {
        return NextResponse.json(cached.data, { headers: { 'X-Cache': 'HIT', 'X-Cache-Updated-At': cached.updated_at as string } })
      }
    }
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
  }
  if (accountIds.length === 0 && legacyAccountId) accountIds = [legacyAccountId]
  if (accountIds.length === 0) return NextResponse.json({ error: 'no_accounts' }, { status: 400 })

  let taxa = 5.85
  try {
    const fx = await fetch('https://api.frankfurter.app/latest?from=USD&to=BRL', { signal: AbortSignal.timeout(5000) })
    if (fx.ok) {
      const fxData = (await fx.json()) as { rates: { BRL: number } }
      taxa = fxData.rates.BRL ?? 5.85
    }
  } catch { /* fallback 5.85 */ }
  console.log('[ROAS] taxa_cambio usada:', taxa)

  try {
    const perAccount = await Promise.all(
      accountIds.map(aid => fetchAccountInsights(aid, connection.access_token, datePreset)),
    )

    let spend_usd = 0, impressions = 0, alcance = 0, cliques_no_link = 0
    let checkouts = 0, compras = 0, adicoes_carrinho = 0, vis_pagina = 0
    let valor_compras_usd = 0, video_plays = 0, video_25 = 0

    for (const r of perAccount) {
      spend_usd         += r.spend_usd
      impressions       += r.impressions
      alcance           += r.alcance
      cliques_no_link   += r.cliques_no_link
      checkouts         += r.checkouts
      compras           += r.compras
      adicoes_carrinho  += r.adicoes_carrinho
      vis_pagina        += r.vis_pagina
      valor_compras_usd += r.valor_compras_usd
      video_plays       += r.video_plays
      video_25          += r.video_25
    }

    // Recalculate derived metrics over aggregated totals
    const ctr          = impressions     > 0 ? (cliques_no_link / impressions) * 100    : 0
    const cpc_usd      = cliques_no_link > 0 ? spend_usd / cliques_no_link              : 0
    const cpm_usd      = impressions     > 0 ? (spend_usd / impressions) * 1000         : 0
    const roas_meta    = spend_usd       > 0 ? valor_compras_usd / spend_usd            : 0
    const hook_rate    = impressions     > 0 ? (video_plays / impressions) * 100        : 0
    const connect_rate = cliques_no_link > 0 ? (checkouts / cliques_no_link) * 100      : 0
    const frequencia   = alcance         > 0 ? impressions / alcance                    : 0

    // ROAS (Geral): Hotmart faturamento / spend_brl for this project
    let roas_geral = 0
    const spend_brl = spend_usd * taxa
    if (projetoId && spend_usd > 0) {
      const dateRange = getDateRange(datePreset)
      console.log('[INSIGHTS] roas_geral: datePreset:', datePreset, 'range:', dateRange.from.toISOString(), '-', dateRange.to.toISOString(), 'spend_brl:', spend_brl)

      const { data: pp } = await supabase
        .from('projeto_produtos')
        .select('produto_id')
        .eq('projeto_id', projetoId)

      const produtoIds = (pp ?? []).map((r: { produto_id: string }) => r.produto_id)
      console.log('[INSIGHTS] roas_geral: produtoIds count:', produtoIds.length)

      if (produtoIds.length > 0) {
        const { data: prods } = await supabase
          .from('produtos')
          .select('hotmart_id')
          .in('id', produtoIds)

        const hotmartIds = (prods ?? []).map((r: { hotmart_id: string }) => r.hotmart_id)
        console.log('[INSIGHTS] roas_geral: hotmartIds count:', hotmartIds.length, hotmartIds)

        if (hotmartIds.length > 0) {
          const { data: vendas } = await supabase
            .from('vendas')
            .select('valor_operacional_final, moeda')
            .in('hotmart_produto_id', hotmartIds)
            .eq('status', 'approved')
            .gte('data_venda', dateRange.from.toISOString())
            .lt('data_venda', dateRange.to.toISOString())

          console.log('[INSIGHTS] roas_geral: vendas aprovadas count:', (vendas ?? []).length)
          const faturamento = (vendas ?? []).reduce(
            (sum: number, v: { valor_operacional_final: number; moeda: string }) => {
              const val = v.valor_operacional_final ?? 0
              return sum + (v.moeda === 'USD' ? val * taxa : val)
            },
            0,
          )
          console.log('[INSIGHTS] roas_geral: faturamento_brl:', faturamento, 'spend_brl:', spend_brl)
          roas_geral = spend_brl > 0 ? faturamento / spend_brl : 0
          console.log('[ROAS DEBUG] projeto_id:', projetoId)
          console.log('[ROAS DEBUG] date_preset:', datePreset)
          console.log('[ROAS DEBUG] from:', dateRange.from, 'to:', dateRange.to)
          console.log('[ROAS DEBUG] hotmartIds:', hotmartIds)
          console.log('[ROAS DEBUG] vendas encontradas:', vendas?.length)
          console.log('[ROAS DEBUG] faturamento_brl:', faturamento)
          console.log('[ROAS DEBUG] spend_brl:', spend_brl)
          console.log('[ROAS DEBUG] roas_geral:', roas_geral)
        }
      }
    }

    const responseData = {
      spend_usd,          spend_brl,
      cpm_usd,            cpm_brl:           cpm_usd          * taxa,
      cpc_usd,            cpc_brl:           cpc_usd          * taxa,
      valor_compras_usd,  valor_compras_brl: valor_compras_usd * taxa,
      impressions,
      alcance,
      frequencia,
      cliques_no_link,
      ctr,
      checkouts,
      compras,
      adicoes_carrinho,
      vis_pagina,
      video_plays,
      video_25,
      hook_rate,
      connect_rate,
      roas_meta,
      roas_geral,
    }

    if (projetoId) {
      await supabase
        .from('meta_insights_cache')
        .upsert(
          { projeto_id: projetoId, date_preset: datePreset, data: responseData, updated_at: new Date().toISOString() },
          { onConflict: 'projeto_id,date_preset' },
        )
    }

    return NextResponse.json(responseData, { headers: { 'X-Cache': 'MISS', 'X-Cache-Updated-At': new Date().toISOString() } })
  } catch (err) {
    console.error('[INSIGHTS] erro:', err)
    return NextResponse.json({ error: 'meta_api_error' }, { status: 502 })
  }
}
