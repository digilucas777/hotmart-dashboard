import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchSaleFromAnyAccount, mapHotmartApiStatus } from '@/lib/hotmart/api'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// A Hotmart não manda um webhook confiável pra toda reversão de disputa/
// chargeback (ex: comprador cancela a solicitação de reembolso e o banco
// libera a transação de volta) — caso real confirmado pelo usuário: duas
// vendas continuavam "disputed" no painel várias horas depois de já
// aparecerem como aprovadas na própria tela da Hotmart, porque nenhum
// webhook novo chegou pra essa transação desde a disputa original. Em vez
// de depender só do webhook, essa rotina periodicamente reconsulta a API
// (fonte da verdade) pras vendas hoje marcadas como disputed/chargeback e
// corrige o status aqui se a Hotmart já resolveu do lado de lá.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const { data: vendas, error } = await admin
    .from('vendas')
    .select('hotmart_id, status')
    .in('status', ['disputed', 'chargeback'])
    .not('hotmart_id', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!vendas || vendas.length === 0) return NextResponse.json({ ok: true, checadas: 0, corrigidas: 0 })

  const resultados: { hotmart_id: string; de: string; para?: string; status: string }[] = []
  let corrigidas = 0

  for (const venda of vendas as { hotmart_id: string; status: string }[]) {
    try {
      const item = await fetchSaleFromAnyAccount(venda.hotmart_id)
      if (!item) {
        resultados.push({ hotmart_id: venda.hotmart_id, de: venda.status, status: 'nao_encontrada_na_api' })
        continue
      }

      const statusReal = mapHotmartApiStatus(item.purchase?.status)
      if (statusReal === venda.status) {
        resultados.push({ hotmart_id: venda.hotmart_id, de: venda.status, status: 'sem_mudanca' })
        continue
      }

      const { error: updateError } = await admin
        .from('vendas')
        .update({ status: statusReal })
        .eq('hotmart_id', venda.hotmart_id)
      if (updateError) {
        resultados.push({ hotmart_id: venda.hotmart_id, de: venda.status, status: `erro_update: ${updateError.message}` })
        continue
      }

      corrigidas += 1
      resultados.push({ hotmart_id: venda.hotmart_id, de: venda.status, para: statusReal, status: 'corrigida' })
    } catch (err) {
      resultados.push({
        hotmart_id: venda.hotmart_id,
        de: venda.status,
        status: `erro: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  return NextResponse.json({ ok: true, checadas: vendas.length, corrigidas, resultados })
}
