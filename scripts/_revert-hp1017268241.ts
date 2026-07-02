/**
 * Reverte HP1017268241 para o valor original extraído do hotmart_payload.
 * Usa commissions[PRODUCER].value do payload salvo no banco.
 * Se commissions estiver vazio → seta valor=0 e loga [MANUAL].
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const HOTMART_ID = 'HP1017268241'

async function main() {
  const { data: venda, error } = await sb
    .from('vendas')
    .select('hotmart_id, valor, comissao_produtor, comissao_coprodutor, hotmart_payload')
    .eq('hotmart_id', HOTMART_ID)
    .single()

  if (error || !venda) {
    console.error('Não encontrado:', error?.message)
    process.exit(1)
  }

  console.log('Estado atual no banco:')
  console.log(`  valor              : ${venda.valor}`)
  console.log(`  comissao_produtor  : ${venda.comissao_produtor}`)
  console.log(`  comissao_coprodutor: ${venda.comissao_coprodutor}`)

  const payload = venda.hotmart_payload as any
  const commissions: any[] = payload?.data?.commissions ?? []
  const producerComm = commissions.find((c: any) => c.source === 'PRODUCER')

  console.log('\nPayload commissions:')
  console.log(JSON.stringify(commissions, null, 2))

  let valorOriginal: number
  let isManual = false

  if (producerComm) {
    // currency_value no commission indica a moeda do value
    // Para moedas exóticas com currency_conversion, o value já é o valor em USD/moeda da comissão
    valorOriginal = Number(producerComm.value ?? 0)
    console.log(`\nPRODUCER encontrado: value=${valorOriginal} (${producerComm.currency_value})`)
  } else {
    valorOriginal = 0
    isManual = true
    console.log('\nCommissions vazio → valor=0, requer revisão manual')
  }

  const { error: updateError } = await sb.from('vendas').update({
    valor: valorOriginal,
    valor_operacional_final: valorOriginal,
    comissao_coprodutor: 0,
  }).eq('hotmart_id', HOTMART_ID)

  if (updateError) {
    console.error('\n[ERRO]', updateError.message)
    process.exit(1)
  }

  if (isManual) {
    console.log(`\n[MANUAL] ${HOTMART_ID}: commissions vazio → valor=0, coprod=0 — revisar manualmente`)
  } else {
    console.log(`\n[OK] ${HOTMART_ID}: valor=${valorOriginal}, coprod=0`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
