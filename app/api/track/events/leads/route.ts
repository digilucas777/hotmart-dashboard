import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'
import { canManageTracking } from '@/app/api/track/_utils'

const STATUS = ['comprou', 'abandonou', 'carrinho', 'engajou', 'visitou']

// Lista de leads do painel (uma linha por visita), via função track_leads (migration 100).
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
  if (!installationId || !start || !end) {
    return NextResponse.json({ error: 'installation_id, start e end são obrigatórios' }, { status: 400 })
  }
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs || endMs - startMs > 400 * 86400000) {
    return NextResponse.json({ error: 'start/end inválidos' }, { status: 400 })
  }
  const status = searchParams.get('status')
  const busca = (searchParams.get('busca') ?? '').trim().slice(0, 100)
  const limit = Math.min(Math.max(Number.parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 200)
  const offset = Math.max(Number.parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0)

  const { data: installation } = await supabase
    .from('track_installations').select('id').eq('id', installationId).eq('user_id', user.id).maybeSingle()
  if (!installation) return NextResponse.json({ error: 'instalação não encontrada' }, { status: 404 })

  const { data, error } = await supabase.rpc('track_leads', {
    p_installation: installationId,
    p_start: start,
    p_end: end,
    p_status: status && STATUS.includes(status) ? status : null,
    p_busca: busca || null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
