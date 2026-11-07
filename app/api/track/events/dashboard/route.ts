import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'
import { canManageTracking } from '@/app/api/track/_utils'

// Painel de rastreamento: funil, gráfico, qualidade e vendas do período (e o
// período anterior do mesmo tamanho, pra comparar). Os números saem da função
// track_dashboard (migration 099), que roda com a RLS do usuário.
export async function GET(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await canManageTracking(supabase, user.id))) {
    return NextResponse.json({ error: 'você não tem permissão de gerenciar rastreamento' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const installationId = searchParams.get('installation_id')
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const tz = searchParams.get('tz') || 'America/Sao_Paulo'
  const hourly = searchParams.get('hourly') === '1'
  if (!installationId || !start || !end) {
    return NextResponse.json({ error: 'installation_id, start e end são obrigatórios' }, { status: 400 })
  }
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs || endMs - startMs > 400 * 86400000) {
    return NextResponse.json({ error: 'start/end inválidos' }, { status: 400 })
  }
  try { new Intl.DateTimeFormat('en', { timeZone: tz }) } catch {
    return NextResponse.json({ error: 'fuso inválido' }, { status: 400 })
  }

  const { data: installation } = await supabase
    .from('track_installations').select('id').eq('id', installationId).eq('user_id', user.id).maybeSingle()
  if (!installation) return NextResponse.json({ error: 'instalação não encontrada' }, { status: 404 })

  const span = endMs - startMs
  const prevStart = new Date(startMs - span).toISOString()
  const [cur, prev] = await Promise.allSettled([
    supabase.rpc('track_dashboard', { p_installation: installationId, p_start: start, p_end: end, p_tz: tz, p_hourly: hourly }),
    supabase.rpc('track_dashboard', { p_installation: installationId, p_start: prevStart, p_end: start, p_tz: tz, p_hourly: false }),
  ])
  if (cur.status !== 'fulfilled' || cur.value.error) {
    const msg = cur.status === 'fulfilled' ? cur.value.error?.message : String(cur.reason)
    return NextResponse.json({ error: msg || 'Não foi possível carregar o painel.' }, { status: 500 })
  }
  // Período anterior só serve pra comparação; se falhar, o painel abre sem ela.
  const anterior = prev.status === 'fulfilled' && !prev.value.error ? prev.value.data : null
  return NextResponse.json({ atual: cur.value.data, anterior })
}
