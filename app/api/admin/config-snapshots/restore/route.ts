import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Restaura uma tabela de configuração a partir de um checkpoint salvo em
// config_snapshots — apaga o estado atual (escopado por scope_id, quando o
// snapshot tiver um) e reinsere exatamente o payload salvo. Uso de
// emergência: achar o snapshot certo via GET /api/admin/config-snapshots
// primeiro, depois POST { "snapshot_id": "..." } aqui.
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const adminClient = getServiceClient()
  if (!adminClient) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })
  const admin = adminClient

  const { snapshot_id } = await request.json().catch(() => ({}))
  if (!snapshot_id) return NextResponse.json({ error: '"snapshot_id" obrigatório' }, { status: 400 })

  const { data: snapshot, error: fetchError } = await admin
    .from('config_snapshots')
    .select('*')
    .eq('id', snapshot_id)
    .maybeSingle()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!snapshot) return NextResponse.json({ error: 'snapshot não encontrado' }, { status: 404 })

  const rows = (snapshot.payload ?? []) as Record<string, unknown>[]

  let deleteQuery = admin.from(snapshot.table_name).delete()
  deleteQuery = snapshot.scope_id
    ? deleteQuery.eq('projeto_id', snapshot.scope_id)
    : deleteQuery.not('id', 'is', null) // sem escopo: apaga a tabela inteira antes de restaurar
  const { error: deleteError } = await deleteQuery
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  if (rows.length > 0) {
    const { error: insertError } = await admin.from(snapshot.table_name).insert(rows)
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, table: snapshot.table_name, scope_id: snapshot.scope_id, linhas_restauradas: rows.length })
}
