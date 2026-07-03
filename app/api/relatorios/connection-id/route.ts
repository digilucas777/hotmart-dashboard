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

export async function GET(request: Request) {
  const { user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const projetoId = searchParams.get('projeto_id')
  if (!projetoId) return NextResponse.json({ error: 'projeto_id required' }, { status: 400 })

  const svc = getServiceClient()
  if (!svc) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const { data: profile } = await svc.from('user_profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = (profile as { role?: string } | null)?.role === 'admin'

  if (!isAdmin) {
    const { data: perm } = await svc
      .from('user_dashboard_permissions')
      .select('pode_visualizar')
      .eq('user_id', user.id)
      .eq('projeto_id', projetoId)
      .maybeSingle()
    if (!(perm as { pode_visualizar?: boolean } | null)?.pode_visualizar) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  const { data: schedule } = await svc
    .from('whatsapp_report_schedules')
    .select('whatsapp_connection_id')
    .eq('projeto_id', projetoId)
    .not('whatsapp_connection_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let connectionId = (schedule as { whatsapp_connection_id?: string } | null)?.whatsapp_connection_id ?? null

  if (!connectionId) {
    const { data: firstConnection } = await svc
      .from('whatsapp_connections')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    connectionId = (firstConnection as { id?: string } | null)?.id ?? null
  }

  return NextResponse.json({ connectionId })
}
