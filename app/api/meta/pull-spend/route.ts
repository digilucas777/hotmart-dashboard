import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, metaFetch } from '../_utils'

type InsightRow = { date_start: string; spend: string }
type InsightResponse = { data?: InsightRow[] }

export async function POST(req: NextRequest) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    projeto_id?: string
    since?: string
    until?: string
  }
  const { projeto_id: projetoId, since, until } = body
  if (!projetoId || !since || !until) {
    return NextResponse.json({ error: 'projeto_id, since e until são obrigatórios' }, { status: 400 })
  }

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

  const { data: projectAccounts } = await supabase
    .from('meta_project_accounts')
    .select('account_id, account_name')
    .eq('projeto_id', projetoId)

  if (!projectAccounts?.length) {
    return NextResponse.json({ error: 'Nenhuma conta Meta vinculada a este projeto' }, { status: 400 })
  }

  const token = conn.access_token as string
  const dayMap: Record<string, { total: number; breakdown: Record<string, number> }> = {}

  for (const account of projectAccounts) {
    const timeRange = JSON.stringify({ since, until })
    let result: InsightResponse
    try {
      result = await metaFetch<InsightResponse>(
        `/act_${account.account_id}/insights?fields=spend,date_start&time_increment=1&time_range=${encodeURIComponent(timeRange)}&level=account`,
        token,
      )
    } catch (err) {
      return NextResponse.json(
        { error: `Meta API error for account ${account.account_name ?? account.account_id}: ${String(err)}` },
        { status: 502 },
      )
    }

    const label = (account.account_name as string | null) ?? (account.account_id as string)
    for (const row of result.data ?? []) {
      const date = row.date_start
      const spend = parseFloat(row.spend ?? '0')
      if (!dayMap[date]) dayMap[date] = { total: 0, breakdown: {} }
      dayMap[date]!.total += spend
      dayMap[date]!.breakdown[label] = spend
    }
  }

  const rows = Object.entries(dayMap).map(([date, { total, breakdown }]) => {
    const breakdownStr = Object.entries(breakdown)
      .map(([name, val]) => `${name}:$${val.toFixed(2)}`)
      .join(' ')
    return {
      projeto_id: projetoId,
      data: date,
      valor: Math.round(total * 100) / 100,
      moeda: 'USD',
      descricao: `Gastos Meta Ads - ${date} - ${breakdownStr}`,
      origem: 'meta_ads',
    }
  })

  if (rows.length > 0) {
    const { error } = await supabase
      .from('custos_manuais')
      .upsert(rows, { onConflict: 'projeto_id,data,origem' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const totalUSD = rows.reduce((sum, r) => sum + r.valor, 0)

  return NextResponse.json({
    dias: rows.length,
    total_usd: Math.round(totalUSD * 100) / 100,
    periodo: { since, until },
  })
}
