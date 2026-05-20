import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Variáveis NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function roundMoney(value: number) {
  return parseFloat(value.toFixed(2))
}

interface HotmartCommission {
  source: string
  currency_value: string
  value: number
}

async function recalcular() {
  const { data: vendas, error } = await supabase
    .from('vendas')
    .select('id, hotmart_id, valor_operacional_final, valor_bruto, hotmart_payload')
    .lt('valor_operacional_final', 0)

  if (error) {
    console.error('Erro ao buscar vendas:', error.message)
    process.exit(1)
  }

  if (!vendas || vendas.length === 0) {
    console.log('Nenhuma venda com valor_operacional_final < 0 encontrada.')
    return
  }

  console.log(`${vendas.length} venda(s) encontrada(s) para recalcular.\n`)

  for (const venda of vendas) {
    const payload = venda.hotmart_payload
    if (!payload) {
      console.warn(`[${venda.hotmart_id}] Sem hotmart_payload — pulando.`)
      continue
    }

    const dados = payload?.data
    const priceObj = dados?.purchase?.original_offer_price ?? dados?.purchase?.price
    const valorBruto: number = Number(priceObj?.value ?? 0)
    const moeda: string = priceObj?.currency_value ?? 'BRL'
    const commissions = (dados?.commissions ?? []) as HotmartCommission[]

    const taxaHotmart = commissions
      .filter((c) => c.currency_value === moeda && String(c.source ?? '').toUpperCase() === 'MARKETPLACE')
      .reduce((sum, c) => sum + (Number(c.value) || 0), 0)

    const novoValor = roundMoney(valorBruto - taxaHotmart)

    const { error: updateError } = await supabase
      .from('vendas')
      .update({ valor_operacional_final: novoValor })
      .eq('id', venda.id)

    if (updateError) {
      console.error(`[${venda.hotmart_id}] Erro ao atualizar: ${updateError.message}`)
    } else {
      console.log(`[${venda.hotmart_id}] ${venda.valor_operacional_final} → ${novoValor}`)
    }
  }

  console.log('\nRecálculo concluído.')
}

recalcular()
