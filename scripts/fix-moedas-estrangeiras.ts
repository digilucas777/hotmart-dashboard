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
    .or('taxa_hotmart.eq.0,valor_operacional_final.lt.20')
    .neq('moeda', 'BRL')
    .ilike('produto', '%tantric%')
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

    const somaUSD = commissions
      .filter((c: any) => c.currency_value === 'USD')
      .reduce((s: number, c: any) => s + Number(c.value), 0)

    if (venda.hotmart_id === 'HP2193577565') {
      console.log('[DEBUG HP2193577565] priceCurrency:', priceCurrency)
      console.log('[DEBUG HP2193577565] commissions raw:', JSON.stringify(commissions))
      console.log('[DEBUG HP2193577565] commissions USD:', JSON.stringify(commissions.filter((c: any) => c.currency_value === 'USD')))
      console.log('[DEBUG HP2193577565] somaUSD:', somaUSD)
      console.log('[DEBUG HP2193577565] original_offer_price:', JSON.stringify(dados?.purchase?.original_offer_price))
    }

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
      const origOffer = dados?.purchase?.original_offer_price
      const taxaHotmartUSD = commissions
        .filter((c: any) => String(c.source).toUpperCase() === 'MARKETPLACE' && c.currency_value === 'USD')
        .reduce((s: number, c: any) => s + Number(c.value), 0)

      if (origOffer?.currency_value === 'USD') {
        valorBruto = Number(origOffer.value) || 0
      } else {
        const rate = commissions.find((c: any) => c.currency_conversion?.conversion_rate)?.currency_conversion?.conversion_rate
        const priceValue = origOffer?.value ?? dados?.purchase?.price?.value
        valorBruto = rate ? roundMoney(Number(priceValue) / rate) : somaUSD
      }
      taxaHotmart = taxaHotmartUSD
      moeda = 'USD'
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
