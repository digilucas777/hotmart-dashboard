import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '../_utils'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const dashboardId = searchParams.get('dashboardId')
  const { supabase, user } = await getAuthenticatedUser()

  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!dashboardId) return NextResponse.json({ error: 'dashboard_required' }, { status: 400 })

  const { data } = await supabase
    .from('dashboard_ad_accounts')
    .select('ad_account_id')
    .eq('dashboard_id', dashboardId)

  return NextResponse.json({ linkedIds: (data ?? []).map(item => item.ad_account_id) })
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { dashboardId?: string; adAccountIds?: string[] }
  if (!body.dashboardId) return NextResponse.json({ error: 'dashboard_required' }, { status: 400 })

  const adAccountIds = body.adAccountIds ?? []
  await supabase.from('dashboard_ad_accounts').delete().eq('dashboard_id', body.dashboardId)

  if (adAccountIds.length) {
    await supabase.from('dashboard_ad_accounts').insert(
      adAccountIds.map(adAccountId => ({
        dashboard_id: body.dashboardId,
        ad_account_id: adAccountId,
      })),
    )
  }

  return NextResponse.json({ ok: true })
}
