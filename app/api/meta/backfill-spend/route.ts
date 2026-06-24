import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, metaFetch } from '../_utils'

const PROJECT_ID = '314861f2-63b1-48d6-b1ea-6208fd64176c'

const ACCOUNTS = [
  { name: 'AN01', id: '1304491764846385' },
  { name: 'AN02', id: '1978765333521792' },
  { name: 'AN03', id: '1714950236578764' },
]

type InsightRow = { date_start: string; spend: string }
type InsightResponse = { data?: InsightRow[] }

export async function POST(req: NextRequest) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { since?: string; until?: string }
  const since = body.since ?? '2026-05-01'
  const until = body.until ?? new Date().toISOString().split('T')[0]!

  const { data: conn } = await supabase
    .from('meta_connections')
    .select('access_token')
    .eq('user_id', user.id)
    .eq('status', 'connected')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conn?.access_token) {
    return NextResponse.json({ error: 'Meta connection not found for this user' }, { status: 400 })
  }

  const token = conn.access_token as string
  const dayMap: Record<string, { total: number; breakdown: Record<string, number> }> = {}

  for (const account of ACCOUNTS) {
    const timeRange = JSON.stringify({ since, until })
    let result: InsightResponse
    try {
      result = await metaFetch<InsightResponse>(
        `/act_${account.id}/insights?fields=spend,date_start&time_increment=1&time_range=${encodeURIComponent(timeRange)}&level=account`,
        token,
      )
    } catch (err) {
      return NextResponse.json({ error: `Meta API error for account ${account.name}: ${String(err)}` }, { status: 502 })
    }

    for (const row of result.data ?? []) {
      const date = row.date_start
      const spend = parseFloat(row.spend ?? '0')
      if (!dayMap[date]) dayMap[date] = { total: 0, breakdown: {} }
      dayMap[date]!.total += spend
      dayMap[date]!.breakdown[account.name] = spend
    }
  }

  const rows = Object.entries(dayMap).map(([date, { total, breakdown }]) => ({
    projeto_id: PROJECT_ID,
    data: date,
    valor: Math.round(total * 100) / 100,
    moeda: 'USD',
    descricao: `Gastos Meta Ads - ${date} - AN01:$${(breakdown['AN01'] ?? 0).toFixed(2)} AN02:$${(breakdown['AN02'] ?? 0).toFixed(2)} AN03:$${(breakdown['AN03'] ?? 0).toFixed(2)}`,
    origem: 'meta_ads',
  }))

  if (rows.length > 0) {
    // Remove registros meta_ads existentes no período antes de inserir
    const { error: delError } = await supabase
      .from('custos_manuais')
      .delete()
      .eq('projeto_id', PROJECT_ID)
      .eq('origem', 'meta_ads')
      .gte('data', since)
      .lte('data', until)
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

    const { error: insError } = await supabase
      .from('custos_manuais')
      .insert(rows)
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
  }

  const totalUSD = rows.reduce((sum, r) => sum + r.valor, 0)

  return NextResponse.json({
    dias: rows.length,
    total_usd: Math.round(totalUSD * 100) / 100,
    periodo: { since, until },
  })
}
