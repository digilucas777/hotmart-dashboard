import { createClient } from '@supabase/supabase-js'
import { parseOrigem } from '../lib/utils'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Variáveis NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function normalizar() {
  const { data: vendas, error } = await supabase
    .from('vendas')
    .select('id, hotmart_id, origem')
    .not('origem', 'is', null)

  if (error) {
    console.error('Erro ao buscar vendas:', error.message)
    process.exit(1)
  }

  if (!vendas || vendas.length === 0) {
    console.log('Nenhuma venda com origem preenchida encontrada.')
    return
  }

  console.log(`${vendas.length} venda(s) encontrada(s) para processar.\n`)

  let totalAtualizadas = 0

  for (const venda of vendas) {
    const normalizada = parseOrigem(venda.origem)

    // parseOrigem retorna '—' para valores nulos/vazios — não sobrescrever com placeholder
    if (normalizada === '—' || normalizada === venda.origem) continue

    const { error: updateError } = await supabase
      .from('vendas')
      .update({ origem: normalizada })
      .eq('id', venda.id)

    if (updateError) {
      console.error(`[NORMALIZAR] Erro ao atualizar ${venda.hotmart_id}: ${updateError.message}`)
    } else {
      console.log(`[NORMALIZAR] HP: ${venda.hotmart_id} antes: ${venda.origem} → depois: ${normalizada}`)
      totalAtualizadas++
    }
  }

  console.log('\n--- Resumo ---')
  console.log(`Total processadas : ${vendas.length}`)
  console.log(`Total atualizadas : ${totalAtualizadas}`)
}

normalizar()
