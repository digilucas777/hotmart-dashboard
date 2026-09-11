import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '../../meta/_utils'

export async function GET(request: Request) {
  const { user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const targetUserId = new URL(request.url).searchParams.get('user_id')
  if (!targetUserId) return NextResponse.json({ error: 'user_id é obrigatório' }, { status: 400 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: profile } = await serviceClient
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Dashboards do usuário-alvo: os que ele é dono, mais os que foram compartilhados com
  // ele (mesma regra de acesso usada em toda a aplicação) — nunca todos os dashboards do
  // sistema. Antes esse filtro nem existia: a rota recebia `user_id` e ignorava, mostrando
  // todo mundo pra qualquer usuário que o admin abrisse.
  const { data: sharedPerms, error: sharedError } = await serviceClient
    .from('user_dashboard_permissions')
    .select('projeto_id')
    .eq('user_id', targetUserId)
    .eq('pode_visualizar', true)
  if (sharedError) return NextResponse.json({ error: sharedError.message }, { status: 500 })

  const sharedIds = (sharedPerms ?? []).map(p => p.projeto_id)
  const ownedFilter = `user_id.eq.${targetUserId}`
  const idsFilter = sharedIds.length > 0 ? `,id.in.(${sharedIds.join(',')})` : ''

  const { data, error } = await serviceClient
    .from('projetos')
    .select('id, nome, descricao, data_criacao')
    .is('deleted_at', null)
    .or(`${ownedFilter}${idsFilter}`)
    .order('data_criacao', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dashboards: data ?? [] })
}
