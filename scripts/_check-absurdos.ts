import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { count: c1 } = await sb
    .from('vendas').select('*', { count: 'exact', head: true })
    .gt('valor', 1000).not('hotmart_payload', 'is', null)
  console.log(`Com payload (> 1000): ${c1}`)

  const { data: semPayload, count: c2 } = await sb
    .from('vendas').select('hotmart_id, valor, comissao_coprodutor', { count: 'exact' })
    .gt('valor', 1000).is('hotmart_payload', null)
  console.log(`Sem payload (> 1000): ${c2}`)
  semPayload?.slice(0, 30).forEach((v: any) =>
    console.log(`  ${v.hotmart_id}: valor=${v.valor} coprod=${v.comissao_coprodutor}`)
  )

  const { count: total } = await sb
    .from('vendas').select('*', { count: 'exact', head: true }).gt('valor', 1000)
  console.log(`\nTotal geral (> 1000): ${total}`)
}

main().catch(e => { console.error(e); process.exit(1) })
