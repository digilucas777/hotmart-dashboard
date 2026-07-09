import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const RETENTION_DAYS = 10

// Roda diariamente (ver vercel.json) e apaga de vez os dashboards que estão na
// lixeira (deleted_at preenchido) há mais de RETENTION_DAYS. `projeto_produtos`
// não tem ON DELETE CASCADE, então precisa ser limpo manualmente antes.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const limite = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: expirados, error: fetchError } = await admin
    .from('projetos')
    .select('id, nome, deleted_at')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', limite)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!expirados || expirados.length === 0) {
    return NextResponse.json({ ok: true, purgados: 0 })
  }

  const resultados: { id: string; nome: string; ok: boolean; error?: string }[] = []
  for (const p of expirados) {
    const { error: prodError } = await admin.from('projeto_produtos').delete().eq('projeto_id', p.id)
    if (prodError) {
      resultados.push({ id: p.id, nome: p.nome, ok: false, error: prodError.message })
      continue
    }
    const { error: delError } = await admin.from('projetos').delete().eq('id', p.id)
    resultados.push({ id: p.id, nome: p.nome, ok: !delError, error: delError?.message })
  }

  return NextResponse.json({
    ok: true,
    purgados: resultados.filter(r => r.ok).length,
    falhas: resultados.filter(r => !r.ok),
  })
}
