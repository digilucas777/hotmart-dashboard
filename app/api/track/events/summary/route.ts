import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'

type EventRow = { event_name: string; source: string; fbp: string | null; fbc: string | null; session_hit: boolean | null }
type RecentRow = {
  event_name: string
  source: string
  session_hit: boolean | null
  received_at: string
  ip: string | null
  fbp: string | null
  fbc: string | null
  session_id: string | null
  geo_city: string | null
  geo_region: string | null
  geo_country: string | null
  url: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  src: string | null
}

export async function GET(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'módulo em teste — só administradores podem usar por enquanto' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const installationId = searchParams.get('installation_id')
  if (!installationId) return NextResponse.json({ error: 'installation_id é obrigatório' }, { status: 400 })

  // track_events não tem user_id direto — confirma que a instalação existe
  // (a query em track_installations já é protegida por RLS: só acha se for
  // do usuário logado ou se ele for admin).
  const { data: installation } = await supabase
    .from('track_installations')
    .select('id')
    .eq('id', installationId)
    .maybeSingle()
  if (!installation) return NextResponse.json({ error: 'instalação não encontrada' }, { status: 404 })

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: events24h, error } = await supabase
    .from('track_events')
    .select('event_name, source, fbp, fbc, session_hit')
    .eq('installation_id', installationId)
    .gte('received_at', since24h)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (events24h ?? []) as EventRow[]
  const counts: Record<string, number> = {}
  let withFbp = 0
  let withFbc = 0
  let capiTotal = 0
  let purchaseTotal = 0
  let purchaseMatched = 0
  for (const row of rows) {
    counts[row.event_name] = (counts[row.event_name] ?? 0) + 1
    // Eventos "pixel" (ex: clique em checkout, só monitoramento — nunca vão
    // pra Meta) nunca têm fbp/fbc por desenho, então ficam fora dessa conta
    // de qualidade — senão puxariam a % pra baixo sem motivo real.
    if (row.source !== 'capi') continue
    capiTotal += 1
    if (row.fbp) withFbp += 1
    if (row.fbc) withFbc += 1
    if (row.event_name === 'Purchase') {
      purchaseTotal += 1
      if (row.session_hit) purchaseMatched += 1
    }
  }

  const { data: recent } = await supabase
    .from('track_events')
    .select('event_name, source, session_hit, received_at, ip, fbp, fbc, session_id, geo_city, geo_region, geo_country, url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, src')
    .eq('installation_id', installationId)
    .order('received_at', { ascending: false })
    .limit(30)

  return NextResponse.json({
    counts_24h: counts,
    coverage_24h: {
      total: capiTotal,
      with_fbp_pct: capiTotal > 0 ? Math.round((withFbp / capiTotal) * 100) : null,
      with_fbc_pct: capiTotal > 0 ? Math.round((withFbc / capiTotal) * 100) : null,
      purchase_session_matched_pct: purchaseTotal > 0 ? Math.round((purchaseMatched / purchaseTotal) * 100) : null,
    },
    recent: (recent ?? []) as RecentRow[],
  })
}
