import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// DESATIVADA em 07/11/2026. Ela apagava TUDO com mais de 14 dias, inclusive
// as vendas (Purchase). A retenção agora é feita no próprio banco pela função
// track_prune_events(45) (migration 098, pg_cron diário): visitas e cliques
// ficam 45 dias com o total por dia guardado, vendas ficam pra sempre.
// A rota continua existindo só pra não quebrar chamadas antigas.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  return NextResponse.json({ ok: true, apagados: 0, motivo: 'retenção feita no banco (track_prune_events)' })
}
