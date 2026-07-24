import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'módulo em teste — só administradores podem usar por enquanto' }, { status: 403 })
  }

  const { id } = await request.json().catch(() => ({})) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

  const { error } = await supabase.from('track_installations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
