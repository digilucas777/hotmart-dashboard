import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '../../meta/_utils'

type PermissionInput = {
  projeto_id: string
  pode_visualizar?: boolean
  pode_editar_layout?: boolean
  pode_adicionar_widgets?: boolean
  pode_configurar_produtos?: boolean
  pode_ver_produtos_ofertas?: boolean
  pode_excluir_dashboard?: boolean
  is_admin_dashboard?: boolean
}

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function verifyAdmin(userId: string) {
  const svc = getServiceClient()
  if (!svc) return false
  const { data } = await svc.from('user_profiles').select('role').eq('id', userId).maybeSingle()
  return (data as { role?: string } | null)?.role === 'admin'
}

export async function GET(request: Request) {
  const { user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!await verifyAdmin(user.id)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const svc = getServiceClient()
  if (!svc) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const targetUserId = searchParams.get('user_id')
  if (!targetUserId) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  const { data, error } = await svc
    .from('user_dashboard_permissions')
    .select('*')
    .eq('user_id', targetUserId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ permissions: data ?? [] })
}

export async function POST(request: Request) {
  const { user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!await verifyAdmin(user.id)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const svc = getServiceClient()
  if (!svc) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const { user_id, permissions } = await request.json() as {
    user_id: string
    permissions: PermissionInput[]
  }
  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  await svc.from('user_dashboard_permissions').delete().eq('user_id', user_id)

  if (permissions && permissions.length > 0) {
    const rows = permissions.map(p => ({
      user_id,
      projeto_id: p.projeto_id,
      pode_visualizar: p.pode_visualizar ?? true,
      pode_editar_layout: p.pode_editar_layout ?? false,
      pode_adicionar_widgets: p.pode_adicionar_widgets ?? false,
      pode_configurar_produtos: p.pode_configurar_produtos ?? false,
      pode_ver_produtos_ofertas: p.pode_ver_produtos_ofertas ?? false,
      pode_excluir_dashboard: p.pode_excluir_dashboard ?? false,
      is_admin_dashboard: p.is_admin_dashboard ?? false,
    }))
    const { error } = await svc.from('user_dashboard_permissions').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
