import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Tabelas de configuração que só mudam por edição manual (admin) — não são
// dados transacionais como `vendas`, que já tem sua própria fonte de verdade
// (a Hotmart) e não precisa desse tipo de checkpoint.
const TABELAS = ['projetos', 'projeto_produtos', 'projeto_produto_ofertas', 'dashboard_widgets', 'custos_manuais']

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const adminClient = getServiceClient()
  if (!adminClient) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })
  const admin = adminClient

  const resultados: { tabela: string; linhas?: number; erro?: string }[] = []

  for (const tabela of TABELAS) {
    const { data, error } = await admin.from(tabela).select('*')
    if (error) {
      resultados.push({ tabela, erro: error.message })
      continue
    }
    const { error: insertError } = await admin.from('config_snapshots').insert({
      table_name: tabela,
      scope_id: null,
      payload: data ?? [],
      reason: 'cron_periodico',
    })
    if (insertError) {
      resultados.push({ tabela, erro: insertError.message })
      continue
    }
    resultados.push({ tabela, linhas: data?.length ?? 0 })
  }

  // Mantém só os últimos 30 snapshots por tabela — sem isso, a tabela cresce
  // pra sempre e nunca é limpa.
  for (const tabela of TABELAS) {
    const { data: antigos } = await admin
      .from('config_snapshots')
      .select('id')
      .eq('table_name', tabela)
      .is('scope_id', null)
      .order('created_at', { ascending: false })
      .range(30, 10000)
    const idsParaExcluir = (antigos ?? []).map((r: { id: string }) => r.id)
    if (idsParaExcluir.length > 0) {
      await admin.from('config_snapshots').delete().in('id', idsParaExcluir)
    }
  }

  return NextResponse.json({ ok: true, resultados })
}
