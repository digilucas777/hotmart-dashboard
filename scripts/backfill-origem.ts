import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Variáveis NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function backfill() {
  const { data: vendas, error } = await supabase
    .from('vendas')
    .select('id, hotmart_id, hotmart_payload')
    .is('origem', null)
    .not('hotmart_payload', 'is', null)

  if (error) {
    console.error('Erro ao buscar vendas:', error.message)
    process.exit(1)
  }

  if (!vendas || vendas.length === 0) {
    console.log('Nenhuma venda encontrada com origem IS NULL e hotmart_payload preenchido.')
    return
  }

  console.log(`${vendas.length} venda(s) encontrada(s) para processar.\n`)

  let totalAtualizadas = 0
  let totalSemOrigem = 0

  for (let i = 0; i < vendas.length; i++) {
    const venda = vendas[i]
    const raw = venda.hotmart_payload
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw
    const dados = payload?.data

    if (i < 3) {
      console.log('[DEBUG] raw type:', typeof raw)
      console.log('[DEBUG] payload keys:', payload ? Object.keys(payload) : 'null')
      console.log('[DEBUG] dados:', JSON.stringify(dados?.purchase?.origin))
    }

    const origem: string | null =
      dados?.purchase?.tracking_parameters?.utm_source ??
      (typeof dados?.purchase?.origin === 'object' ? dados?.purchase?.origin?.src : dados?.purchase?.origin) ??
      null

    if (origem === null) {
      totalSemOrigem++
      continue
    }

    const { error: updateError } = await supabase
      .from('vendas')
      .update({ origem })
      .eq('id', venda.id)

    if (updateError) {
      console.error(`[BACKFILL] Erro ao atualizar ${venda.hotmart_id}: ${updateError.message}`)
    } else {
      console.log(`[BACKFILL] HP: ${venda.hotmart_id} → origem: ${origem}`)
      totalAtualizadas++
    }
  }

  console.log('\n--- Resumo ---')
  console.log(`Total processadas : ${vendas.length}`)
  console.log(`Total atualizadas : ${totalAtualizadas}`)
  console.log(`Total sem origem  : ${totalSemOrigem}`)
}

backfill()
