import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function checkAuth(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  return !!cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`
}

// Lista os checkpoints disponíveis pra uma tabela (e opcionalmente um
// projeto específico) — usar pra achar qual snapshot restaurar antes de
// chamar POST /api/admin/config-snapshots/restore.
// Exemplo: /api/admin/config-snapshots?table=projeto_produtos&scope_id=<projeto_id>
export async function GET(request: Request) {
  if (!checkAuth(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const adminClient = getServiceClient()
  if (!adminClient) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })
  const admin = adminClient

  const url = new URL(request.url)
  const tableName = url.searchParams.get('table')
  const scopeId = url.searchParams.get('scope_id')
  if (!tableName) return NextResponse.json({ error: 'parâmetro "table" obrigatório' }, { status: 400 })

  let query = admin
    .from('config_snapshots')
    .select('id, table_name, scope_id, reason, created_at')
    .eq('table_name', tableName)
    .order('created_at', { ascending: false })
    .limit(50)
  query = scopeId ? query.eq('scope_id', scopeId) : query.is('scope_id', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, snapshots: data })
}
