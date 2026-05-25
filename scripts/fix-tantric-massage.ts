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

async function fixTantricMassage() {
  const { data: vendas, error } = await supabase
    .from('vendas')
    .select('id, hotmart_id, moeda, valor_bruto, taxa_hotmart, valor_operacional_final, hotmart_payload')
    .ilike('produto', '%tantric%')
    .eq('taxa_hotmart', 0)

  if (error) {
    console.error('Erro ao buscar vendas:', error.message)
    process.exit(1)
  }

  if (!vendas || vendas.length === 0) {
    console.log('Nenhuma venda Tantric com taxa_hotmart = 0 encontrada.')
    return
  }

  console.log(`${vendas.length} venda(s) encontrada(s) para corrigir.\n`)

  for (const venda of vendas) {
    const payload = venda.hotmart_payload
    if (!payload) {
      console.warn(`[${venda.hotmart_id}] Sem hotmart_payload — pulando.`)
      continue
    }

    const dados = payload?.data
    // Sempre usar purchase.price (valor real cobrado na moeda operacional)
    const priceObj = dados?.purchase?.price ?? dados?.purchase?.original_offer_price
    const valorBruto: number = Number(priceObj?.value ?? 0)
    const moeda: string = priceObj?.currency_value ?? 'BRL'
    const commissions = (dados?.commissions ?? []) as HotmartCommission[]

    const taxaHotmart = commissions
      .filter(c => c.currency_value === moeda && String(c.source ?? '').toUpperCase() === 'MARKETPLACE')
      .reduce((sum, c) => sum + (Number(c.value) || 0), 0)

    const valorOperacionalFinal = roundMoney(valorBruto - taxaHotmart)

    console.log(`[${venda.hotmart_id}] moeda: ${venda.moeda} → ${moeda} | bruto: ${venda.valor_bruto} → ${valorBruto} | taxa: ${venda.taxa_hotmart} → ${taxaHotmart} | final: ${venda.valor_operacional_final} → ${valorOperacionalFinal}`)

    const { error: updateError } = await supabase
      .from('vendas')
      .update({ moeda, valor_bruto: valorBruto, taxa_hotmart: taxaHotmart, valor_operacional_final: valorOperacionalFinal })
      .eq('id', venda.id)

    if (updateError) {
      console.error(`[${venda.hotmart_id}] Erro ao atualizar: ${updateError.message}`)
    }
  }

  console.log('\nCorreção concluída.')
}

fixTantricMassage()
