/**
 * Deleta registros incorretos criados pelo backfill da conta 2 em 02/07/2026.
 * Critérios: valor > 1000 E data_criacao entre 13:00 e 14:00 UTC.
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DATA_INICIO = '2026-07-02T13:00:00.000Z'
const DATA_FIM    = '2026-07-02T14:00:00.000Z'
const VALOR_MIN   = 1000

async function main() {
  console.log('=== Delete: registros absurdos do backfill 02/07/2026 ===')
  console.log(`Janela: ${DATA_INICIO} → ${DATA_FIM}`)
  console.log(`Filtro: valor > ${VALOR_MIN}\n`)

  // Busca primeiro para logar antes de deletar
  const { data: alvos, error: selectError } = await sb
    .from('vendas')
    .select('id, hotmart_id, valor, data_venda, data_criacao')
    .gt('valor', VALOR_MIN)
    .gte('data_criacao', DATA_INICIO)
    .lte('data_criacao', DATA_FIM)
    .order('data_criacao')

  if (selectError) {
    console.error('Erro ao buscar:', selectError.message)
    process.exit(1)
  }

  if (!alvos || alvos.length === 0) {
    console.log('Nenhum registro encontrado com esses critérios.')
    console.log('\nDica: tente ajustar o intervalo de horário — pode ser UTC vs BRT.')
    return
  }

  console.log(`Encontrados: ${alvos.length} registros\n`)

  let totalDeletados = 0

  for (const v of alvos) {
    console.log(`  [DELETANDO] ${v.hotmart_id}  valor=$${v.valor}  data_venda=${v.data_venda}  data_criacao=${v.data_criacao}`)

    const { error: delError } = await sb
      .from('vendas')
      .delete()
      .eq('id', v.id)

    if (delError) {
      console.error(`  [ERRO] ${v.hotmart_id}: ${delError.message}`)
    } else {
      console.log(`  [DELETADO] ${v.hotmart_id}  valor=$${v.valor}  data_venda=${v.data_venda}`)
      totalDeletados++
    }
  }

  console.log(`\n=== Resumo ===`)
  console.log(`Encontrados : ${alvos.length}`)
  console.log(`Deletados   : ${totalDeletados}`)
}

main().catch(e => { console.error('Erro fatal:', e.message); process.exit(1) })
