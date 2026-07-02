import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const IDS = ['HP16015479281022', 'HP0113847772']
async function main() {
  for (const id of IDS) {
    const { error } = await sb.from('vendas').delete().eq('hotmart_id', id)
    console.log(error ? `[ERRO] ${id}: ${error.message}` : `[DELETADO] ${id}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
