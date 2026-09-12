import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '../../meta/_utils'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Só quem já é "role=admin" (o dono/administrador geral) pode liberar essa
// permissão pros outros — a permissão em si (pode_gerenciar_rastreamento) NÃO
// dá esse poder de conceder a mais ninguém, só o acesso à própria aba.
export async function POST(request: Request) {
  const { user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const svc = getServiceClient()
  if (!svc) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const { data: requester } = await svc.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
  if ((requester as { role?: string } | null)?.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as { user_id?: string; pode_gerenciar_rastreamento?: boolean } | null
  if (!body?.user_id || typeof body.pode_gerenciar_rastreamento !== 'boolean') {
    return NextResponse.json({ error: 'user_id e pode_gerenciar_rastreamento são obrigatórios' }, { status: 400 })
  }

  const { error } = await svc
    .from('user_profiles')
    .update({ pode_gerenciar_rastreamento: body.pode_gerenciar_rastreamento })
    .eq('id', body.user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
