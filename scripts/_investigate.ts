import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const IDS = ['HP16015479281022', 'HP0113847772']

async function main() {
  for (const id of IDS) {
    const { data, error } = await sb
      .from('vendas')
      .select('hotmart_id, valor, valor_recebido, comissao_coprodutor, data_venda, data_criacao, moeda, status, hotmart_payload')
      .eq('hotmart_id', id)
      .single()

    console.log('='.repeat(70))
    console.log(`ID: ${id}`)
    if (error || !data) { console.log('Não encontrado:', error?.message); continue }

    console.log(`valor          : ${data.valor} ${data.moeda}`)
    console.log(`valor_recebido : ${data.valor_recebido}`)
    console.log(`coprod         : ${data.comissao_coprodutor}`)
    console.log(`status         : ${data.status}`)
    console.log(`data_venda     : ${data.data_venda}`)
    console.log(`data_criacao     : ${data.data_criacao}`)
    console.log('\nhotmart_payload:')
    console.log(JSON.stringify(data.hotmart_payload, null, 2))
    console.log()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
