import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'

const VALID_EVENT_NAMES = ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase']

// Usada pelo painel de eventos pra buscar TODOS os eventos de um tipo num dia
// específico (sem limite artificial) — o cliente já manda start/end em ISO
// calculados a partir da meia-noite local do dia escolhido, então essa rota
// não precisa saber nada sobre fuso horário.
export async function GET(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'módulo em teste — só administradores podem usar por enquanto' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const installationId = searchParams.get('installation_id')
  const eventName = searchParams.get('event_name')
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  if (!installationId || !eventName || !start || !end) {
    return NextResponse.json({ error: 'installation_id, event_name, start e end são obrigatórios' }, { status: 400 })
  }
  if (!VALID_EVENT_NAMES.includes(eventName)) {
    return NextResponse.json({ error: 'event_name inválido' }, { status: 400 })
  }
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return NextResponse.json({ error: 'start/end inválidos' }, { status: 400 })
  }

  // Paginação "carregar mais": o painel busca aos poucos em vez do dia
  // inteiro de uma vez (um dia bom de tráfego passa fácil de mil eventos).
  const limitParam = Number.parseInt(searchParams.get('limit') ?? '', 10)
  const offsetParam = Number.parseInt(searchParams.get('offset') ?? '', 10)
  const limit = Number.isNaN(limitParam) ? 50 : Math.min(Math.max(limitParam, 1), 200)
  const offset = Number.isNaN(offsetParam) ? 0 : Math.max(offsetParam, 0)

  // track_events não tem user_id direto — confirma que a instalação existe
  // (a query em track_installations já é protegida por RLS: só acha se for
  // do usuário logado ou se ele for admin).
  const { data: installation } = await supabase
    .from('track_installations')
    .select('id')
    .eq('id', installationId)
    .maybeSingle()
  if (!installation) return NextResponse.json({ error: 'instalação não encontrada' }, { status: 404 })

  // Busca limit+1 pra saber se tem mais sem precisar de uma segunda query de
  // contagem — .range é inclusivo nas duas pontas, então offset..offset+limit
  // devolve limit+1 linhas quando existem.
  const { data: events, error } = await supabase
    .from('track_events')
    .select('event_name, source, session_hit, capi_send_ok, received_at, ip, fbp, fbc, session_id, geo_city, geo_region, geo_country, url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, src')
    .eq('installation_id', installationId)
    .eq('event_name', eventName)
    .gte('received_at', start)
    .lt('received_at', end)
    .order('received_at', { ascending: false })
    .range(offset, offset + limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = events ?? []
  const hasMore = rows.length > limit
  return NextResponse.json({ events: rows.slice(0, limit), hasMore })
}
