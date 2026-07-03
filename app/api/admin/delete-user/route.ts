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

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { user_id } = await request.json() as { user_id?: string }
  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  if (user_id === user.id) {
    return NextResponse.json({ error: 'não é possível excluir a própria conta' }, { status: 400 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const { error } = await admin.auth.admin.deleteUser(user_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
