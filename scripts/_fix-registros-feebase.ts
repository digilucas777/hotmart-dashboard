import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const FIXES = [
  {
    hotmart_id: 'HP1043464506',
    valor: 28.77,
    comissao_coprodutor: 28.48,
    valor_recebido: 0.29,
    valor_operacional_final: 28.77,
  },
  {
    hotmart_id: 'HP1030767792',
    valor: 8.99,
    comissao_coprodutor: 8.90,
    valor_recebido: 0.09,
    valor_operacional_final: 8.99,
  },
]

async function main() {
  for (const fix of FIXES) {
    const { hotmart_id, ...fields } = fix
    const { error } = await sb.from('vendas').update(fields).eq('hotmart_id', hotmart_id)
    if (error) {
      console.error(`[ERRO] ${hotmart_id}: ${error.message}`)
    } else {
      console.log(`[OK] ${hotmart_id}: valor=${fix.valor}, coprod=${fix.comissao_coprodutor}, recebido=${fix.valor_recebido}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
