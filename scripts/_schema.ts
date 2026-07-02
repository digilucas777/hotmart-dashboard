import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  // Pega uma linha qualquer para ver as colunas disponíveis
  const { data, error } = await sb.from('vendas').select('*').limit(1)
  if (error) { console.error(error.message); process.exit(1) }
  if (data?.[0]) {
    console.log('Colunas da tabela vendas:')
    Object.keys(data[0]).forEach(k => console.log(`  ${k}: ${typeof (data[0] as any)[k]} = ${JSON.stringify((data[0] as any)[k])?.slice(0, 60)}`))
  }
}
main().catch(e => { console.error(e); process.exit(1) })
