import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Um lead do Lucas (já comprou o produto do tráfego em inglês dele) às vezes
// compra de novo via Recuperação/App-Inglês — só que aí sob outro
// hotmart_produto_id, então não conta pro projeto dele normalmente. Esse
// cron roda todo fim do dia e reatribui essas vendas específicas pro
// projeto "LUCAS-RECUPERAÇÃO+APP INGLES" (ver migração 076 e a função
// atribuir_leads_ingles_lucas — ela nunca conta a mesma venda 2x, só move).
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  // Dia local de Brasília (UTC-3), do início do dia até agora.
  const agora = new Date()
  const inicioDia = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), 3, 0, 0))
  if (inicioDia > agora) inicioDia.setUTCDate(inicioDia.getUTCDate() - 1)

  const { data, error } = await admin.rpc('atribuir_leads_ingles_lucas', {
    p_from: inicioDia.toISOString(),
    p_to: agora.toISOString(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, atribuidas: data?.length ?? 0, vendas: data ?? [] })
}
