import { NextResponse } from 'next/server'
import crypto from 'crypto'
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

  const webhook_secret = crypto.randomBytes(24).toString('hex')
  const { data, error } = await supabase
    .from('track_installations')
    .update({ webhook_secret, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('worker_subdomain, webhook_secret')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const row = data as { worker_subdomain: string | null; webhook_secret: string }
  const webhook_url = row.worker_subdomain
    ? `https://${row.worker_subdomain}/webhook/hotmart?secret=${row.webhook_secret}`
    : null

  return NextResponse.json({ webhook_secret: row.webhook_secret, webhook_url })
}
