import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getHotmartAccountTokens, fetchCommissionsWithTokens } from '@/lib/hotmart/api'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function roundMoney(value: number) {
  return parseFloat(value.toFixed(2))
}

const CONCURRENCIA = 8

// Bug real encontrado (2026-08-23, venda HP3471604048 sinalizada pelo
// usuário): pra vendas em moeda exótica (não BRL/USD) COM coprodução, o
// webhook só enxerga a fatia do produtor no payload síncrono — o valor real
// (produtor + coprodutor + afiliado) precisa ser buscado em /sales/
// commissions. Essa busca acontecia só 1x, na hora do webhook — se a Hotmart
// ainda não tinha processado o split de comissões naquele instante (comum,
// é rápido mas não instantâneo), a venda ficava PARA SEMPRE com o valor
// síncrono incompleto (ex: US$0,28 numa venda de US$27,60 de verdade,
// porque a fatia do coprodutor nunca chegava a ser somada).
//
// O webhook (app/api/webhook/hotmart/route.ts) já ganhou retry (4 tentativas
// com espera crescente) pra vendas NOVAS. Essa rotina corrige o passado:
// reconsulta a API pra toda venda já registrada como "moeda exótica +
// coprodução" que ainda está com comissao_coprodutor zerada (sinal de que a
// correção original nunca aconteceu) e atualiza com o valor real.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 })

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const adminClient = getServiceClient()
  if (!adminClient) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })
  const admin = adminClient

  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 100, 500)

  const { data: vendas, error } = await admin
    .from('vendas')
    .select('hotmart_id, status, taxa_hotmart')
    .not('hotmart_id', 'is', null)
    .not('status', 'eq', 'abandoned')
    .filter('hotmart_payload->data->product->>has_co_production', 'eq', 'true')
    .not('hotmart_payload->data->purchase->price->>currency_value', 'in', '(BRL,USD)')
    .or('comissao_coprodutor.eq.0,comissao_coprodutor.is.null')
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!vendas || vendas.length === 0) return NextResponse.json({ ok: true, checadas: 0, corrigidas: 0 })

  const accounts = await getHotmartAccountTokens()
  const resultados: { hotmart_id: string; status: string; valor_corrigido?: number }[] = []
  let corrigidas = 0

  async function corrigirVenda(venda: { hotmart_id: string; status: string; taxa_hotmart: number | null }) {
    try {
      const item = await fetchCommissionsWithTokens(venda.hotmart_id, accounts)
      const commissionsApi = (item?.commissions ?? []) as any[]
      if (commissionsApi.length === 0) {
        resultados.push({ hotmart_id: venda.hotmart_id, status: 'sem_resposta_da_api' })
        return
      }

      let produtorCorrigido = 0
      let coprodutorCorrigido = 0
      let afiliadoCorrigido = 0
      for (const c of commissionsApi) {
        const source = String(c?.commission?.source ?? c?.source ?? '').toUpperCase()
        const currency = c?.commission?.currency_code ?? c?.currency_code
        const value = Number(c?.commission?.value ?? c?.value ?? 0)
        if (currency && currency !== 'USD') continue
        if (source.includes('COPRODUC')) coprodutorCorrigido += value
        else if (source.includes('AFFILIATE') || source.includes('AFILIADO')) afiliadoCorrigido += value
        else if (source === 'PRODUCER' || source === 'SELLER' || source === 'VENDOR' || source.includes('OWNER')) produtorCorrigido += value
      }

      if (coprodutorCorrigido === 0 && afiliadoCorrigido === 0) {
        // API respondeu mas confirma que não tem coprodutor/afiliado nessa venda
        // específica (produto com coprodução configurada, mas essa transação em
        // particular não teve split) — o valor síncrono já estava certo.
        resultados.push({ hotmart_id: venda.hotmart_id, status: 'sem_mudanca' })
        return
      }

      const taxaHotmart = Number(venda.taxa_hotmart ?? 0)
      const valorCorrigido = venda.status === 'abandoned' ? 0 : roundMoney(produtorCorrigido + coprodutorCorrigido + afiliadoCorrigido)
      const brutoCorrigido = roundMoney(valorCorrigido + taxaHotmart)

      const { error: updateError } = await admin
        .from('vendas')
        .update({
          valor_bruto: brutoCorrigido,
          valor: valorCorrigido,
          valor_operacional_final: valorCorrigido,
          comissao_produtor: roundMoney(produtorCorrigido),
          comissao_coprodutor: roundMoney(coprodutorCorrigido),
          comissao_afiliado: roundMoney(afiliadoCorrigido),
          valor_recebido: roundMoney(produtorCorrigido),
        })
        .eq('hotmart_id', venda.hotmart_id)
      if (updateError) {
        resultados.push({ hotmart_id: venda.hotmart_id, status: `erro_update: ${updateError.message}` })
        return
      }

      corrigidas += 1
      resultados.push({ hotmart_id: venda.hotmart_id, status: 'corrigida', valor_corrigido: valorCorrigido })
    } catch (err) {
      resultados.push({ hotmart_id: venda.hotmart_id, status: `erro: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  const lista = vendas as { hotmart_id: string; status: string; taxa_hotmart: number | null }[]
  for (let i = 0; i < lista.length; i += CONCURRENCIA) {
    await Promise.all(lista.slice(i, i + CONCURRENCIA).map(corrigirVenda))
  }

  return NextResponse.json({ ok: true, checadas: lista.length, corrigidas, resultados })
}
