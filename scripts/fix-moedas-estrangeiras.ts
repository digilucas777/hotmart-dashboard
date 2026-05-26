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

async function fixMoedasEstrangeiras() {
  const MOEDAS_ESTRANGEIRAS = ['GBP','EUR','MXN','COP','PEN','ARS','NGN','CAD','AUD','HNL','JPY','CHF']

  const [res1, res2] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, hotmart_id, moeda, valor_bruto, taxa_hotmart, valor_operacional_final, hotmart_payload')
      .eq('taxa_hotmart', 0)
      .in('moeda', MOEDAS_ESTRANGEIRAS),
    supabase
      .from('vendas')
      .select('id, hotmart_id, moeda, valor_bruto, taxa_hotmart, valor_operacional_final, hotmart_payload')
      .eq('moeda', 'USD')
      .lt('valor_operacional_final', 1)
      .not('hotmart_payload', 'is', null),
  ])

  if (res1.error) { console.error('Erro query 1:', res1.error.message); process.exit(1) }
  if (res2.error) { console.error('Erro query 2:', res2.error.message); process.exit(1) }

  const seen = new Set<string>()
  const vendas = [...(res1.data ?? []), ...(res2.data ?? [])].filter(v => {
    if (seen.has(v.id)) return false
    seen.add(v.id)
    return true
  })

  if (vendas.length === 0) {
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

    // Vendas internacionais: valor_bruto = soma de todas as commissions em USD
    const valorBruto: number = commissions
      .filter(c => c.currency_value === 'USD')
      .reduce((sum, c) => sum + (Number(c.value) || 0), 0)

    const taxaHotmart: number = commissions
      .filter(c => c.currency_value === 'USD' && String(c.source ?? '').toUpperCase() === 'MARKETPLACE')
      .reduce((sum, c) => sum + (Number(c.value) || 0), 0)

    const moeda = 'USD'
    const valorOperacionalFinal = roundMoney(valorBruto - taxaHotmart)

    console.log(`[${venda.hotmart_id}] ${venda.moeda} ${venda.valor_bruto} → ${moeda} ${valorBruto}`)

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
