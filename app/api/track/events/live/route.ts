import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'
import { canManageTracking } from '@/app/api/track/_utils'

// Aba lateral "Ao vivo" do painel de rastreamento (função track_live, migration 110).
export async function GET(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await canManageTracking(supabase, user.id))) {
    return NextResponse.json({ error: 'você não tem permissão de gerenciar rastreamento' }, { status: 403 })
  }
  const id = new URL(request.url).searchParams.get('installation_id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'installation_id inválido' }, { status: 400 })
  const { data, error } = await supabase.rpc('track_live', { p_installation: id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
