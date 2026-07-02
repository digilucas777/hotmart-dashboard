import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Registros que receberam valores impossíveis da conta 2 (API retornou dados agregados/errados)
// Revertendo para os valores originais do webhook da conta 1 (valor pequeno, coprod=0)
const REVERT = [
  { hotmart_id: 'HP1017268241',  valor: 24.18 },
  { hotmart_id: 'HP0696943141',  valor: 0.02  },
  { hotmart_id: 'HP2388779813C4', valor: 0.12 },
  { hotmart_id: 'HP2589895694',  valor: 0.23  },
]

async function main() {
  for (const r of REVERT) {
    const { error } = await sb.from('vendas').update({
      comissao_coprodutor: 0,
      valor: r.valor,
      valor_operacional_final: r.valor,
    }).eq('hotmart_id', r.hotmart_id)

    if (error) {
      console.error(`[ERRO] ${r.hotmart_id}: ${error.message}`)
    } else {
      console.log(`[REVERTIDO] ${r.hotmart_id} → valor=${r.valor}, coprod=0`)
    }
  }
  console.log('\nPronto. Essas 4 transações precisam de investigação manual.')
}

main().catch(e => { console.error(e); process.exit(1) })
