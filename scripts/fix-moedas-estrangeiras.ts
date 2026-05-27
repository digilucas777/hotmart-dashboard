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
  currency_conversion?: { conversion_rate?: number }
}

async function fixMoedasEstrangeiras() {
  const { data: vendas, error } = await supabase
    .from('vendas')
    .select('id, hotmart_id, moeda, valor_bruto, taxa_hotmart, valor_operacional_final, hotmart_payload')
    .or('taxa_hotmart.eq.0,valor_operacional_final.lt.5')
    .neq('moeda', 'BRL')
    .not('hotmart_payload', 'is', null)

  if (error) { console.error('Erro ao buscar vendas:', error.message); process.exit(1) }

  if (!vendas || vendas.length === 0) {
    console.log('Nenhuma venda para corrigir encontrada.')
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
    const commissions = (dados?.commissions ?? []) as HotmartCommission[]

    const priceCurrency: string = dados?.purchase?.price?.currency_value ?? 'BRL'

    let moeda: string
    let valorBruto: number
    let taxaHotmart: number

    if (priceCurrency === 'BRL') {
      moeda = 'BRL'
      valorBruto = Number(dados?.purchase?.price?.value ?? 0)
      taxaHotmart = commissions
        .filter(c => c.currency_value === 'BRL' && String(c.source ?? '').toUpperCase() === 'MARKETPLACE')
        .reduce((sum, c) => sum + (Number(c.value) || 0), 0)
    } else if (priceCurrency === 'USD') {
      moeda = 'USD'
      valorBruto = Number(dados?.purchase?.price?.value ?? 0)
      taxaHotmart = commissions
        .filter(c => c.currency_value === 'USD' && String(c.source ?? '').toUpperCase() === 'MARKETPLACE')
        .reduce((sum, c) => sum + (Number(c.value) || 0), 0)
    } else {
      moeda = 'USD'
      const convRate = commissions
        .map(c => c.currency_conversion?.conversion_rate)
        .find(r => r != null && Number(r) > 0)
      const rate = Number(convRate ?? 0)
      const priceValue = Number(
        dados?.purchase?.original_offer_price?.value ??
        dados?.purchase?.price?.value ??
        0,
      )
      valorBruto = rate > 0 ? roundMoney(priceValue / rate) : 0
      taxaHotmart = commissions
        .filter(c => c.currency_value === 'USD' && String(c.source ?? '').toUpperCase() === 'MARKETPLACE')
        .reduce((sum, c) => sum + (Number(c.value) || 0), 0)
    }

    const valorOperacionalFinal = roundMoney(valorBruto - taxaHotmart)

    console.log(`[${venda.hotmart_id}] ${priceCurrency} | ${venda.valor_bruto} → ${moeda} ${valorBruto}`)

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

fixMoedasEstrangeiras()
