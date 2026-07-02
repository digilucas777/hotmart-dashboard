/**
 * Reverte vendas antigas (data_venda < 2026-07-02) que tiveram comissao_coprodutor
 * indevidamente atribuído pelos scripts de fix.
 * Recalcula valor a partir do hotmart_payload e zera comissao_coprodutor.
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DATA_CORTE  = '2026-07-02T00:00:00.000Z'
const PAGE_SIZE   = 500
const MAX_BASE    = 5000  // acima disso, hotmart_fee.base está em moeda local (ARS, COP…)
const STATUS_ZERO = new Set(['abandoned', 'cancelled', 'refunded'])

function roundMoney(v: number) { return parseFloat(v.toFixed(2)) }
function sleep(ms: number)     { return new Promise(r => setTimeout(r, ms)) }

function calcularValor(
  payload: any,
  status: string,
  moeda: string,
  valorRecebidoDB: number | null,
): { valor: number; metodo: string } | null {

  // Vendas canceladas/abandonadas sempre valem 0
  if (STATUS_ZERO.has(status)) {
    return { valor: 0, metodo: 'status-zero' }
  }

  if (!payload?.data) {
    // Sem payload — tenta valor_recebido do banco (só USD/BRL, limite razoável)
    if ((moeda === 'USD' || moeda === 'BRL') && valorRecebidoDB != null && valorRecebidoDB > 0 && valorRecebidoDB <= MAX_BASE) {
      return { valor: roundMoney(valorRecebidoDB), metodo: `valor_recebido-db=${valorRecebidoDB}` }
    }
    return null
  }

  const dados    = payload.data
  const purchase = dados.purchase
  const comms: any[] = dados.commissions ?? []

  // (1) commissions[] não vazio → usa PRODUCER.value
  if (comms.length > 0) {
    const producer = comms.find((c: any) => c.source === 'PRODUCER')
    if (producer) {
      const v = roundMoney(Number(producer.value ?? 0))
      if (v > 0) return { valor: v, metodo: `commissions[PRODUCER]=${v}` }
    }
    // Fallback: soma tudo exceto MARKETPLACE
    const soma = roundMoney(
      comms.filter((c: any) => c.source !== 'MARKETPLACE')
           .reduce((acc: number, c: any) => acc + Number(c.value ?? 0), 0)
    )
    if (soma > 0) return { valor: soma, metodo: `commissions-soma=${soma}` }
  }

  // (2) commissions[] vazio + hotmart_fee.base existe
  const feeBase  = purchase?.hotmart_fee?.base
  const feeTotal = purchase?.hotmart_fee?.total
  if (feeBase != null && feeTotal != null) {
    const baseNum = Number(feeBase)
    if (baseNum > MAX_BASE) return null  // moeda exótica em valor local
    const liquido = roundMoney(baseNum - Number(feeTotal))
    if (liquido > 0) return { valor: liquido, metodo: `fee.base(${baseNum})-fee.total(${feeTotal})=${liquido}` }
  }

  // (3) hotmart_fee null + moeda USD/BRL → valor_recebido do banco
  if ((moeda === 'USD' || moeda === 'BRL') && valorRecebidoDB != null && valorRecebidoDB > 0 && valorRecebidoDB <= MAX_BASE) {
    return { valor: roundMoney(valorRecebidoDB), metodo: `valor_recebido-db=${valorRecebidoDB}` }
  }

  return null
}

async function main() {
  console.log('=== Fix: reverter vendas antigas para cálculo simples ===')
  console.log(`Critério: data_venda < ${DATA_CORTE}  E  comissao_coprodutor > 0\n`)

  let offset = 0
  let pagina = 0
  let totalLidas    = 0
  let totalAlteradas = 0
  let totalSkips    = 0
  let totalErros    = 0
  const skips: string[] = []

  while (true) {
    pagina++
    const { data: vendas, error } = await sb
      .from('vendas')
      .select('id, hotmart_id, valor, moeda, status, valor_recebido, comissao_coprodutor, hotmart_payload')
      .lt('data_venda', DATA_CORTE)
      .gt('comissao_coprodutor', 0)
      .range(offset, offset + PAGE_SIZE - 1)
      .order('id')

    if (error) { console.error('Erro ao buscar:', error.message); process.exit(1) }
    if (!vendas || vendas.length === 0) break

    totalLidas += vendas.length
    console.log(`--- Página ${pagina}: ${vendas.length} vendas ---`)

    for (const venda of vendas) {
      const hotmartId  = venda.hotmart_id as string
      const valorAtual = Number(venda.valor ?? 0)
      const moeda      = (venda.moeda as string) ?? 'BRL'
      const status     = (venda.status as string) ?? 'approved'
      const valReceb   = venda.valor_recebido != null ? Number(venda.valor_recebido) : null

      const resultado = calcularValor(venda.hotmart_payload, status, moeda, valReceb)

      if (!resultado) {
        console.log(`  [SKIP] ${hotmartId}: sem dados suficientes (valor=${valorAtual} moeda=${moeda})`)
        skips.push(`${hotmartId} (valor=${valorAtual} moeda=${moeda} coprod=${venda.comissao_coprodutor})`)
        totalSkips++
        continue
      }

      const { valor: valorNovo, metodo } = resultado
      const diff  = roundMoney(valorNovo - valorAtual)
      const sinal = diff >= 0 ? '+' : ''

      const { error: updateError } = await sb
        .from('vendas')
        .update({
          valor:                  valorNovo,
          valor_operacional_final: valorNovo,
          comissao_coprodutor:    0,
        })
        .eq('id', venda.id)

      if (updateError) {
        console.error(`  [ERRO] ${hotmartId}: ${updateError.message}`)
        totalErros++
      } else {
        console.log(`  [REVERTIDO] ${hotmartId}: ${valorAtual} → ${valorNovo} (${sinal}${diff}) [${metodo}]`)
        totalAlteradas++
      }

      await sleep(50)
    }

    offset += PAGE_SIZE
    if (vendas.length < PAGE_SIZE) break
  }

  console.log('\n=== Resumo ===')
  console.log(`Lidas     : ${totalLidas}`)
  console.log(`Revertidas: ${totalAlteradas}`)
  console.log(`Skips     : ${totalSkips}`)
  console.log(`Erros     : ${totalErros}`)

  if (skips.length > 0) {
    console.log(`\n--- [SKIP] (${skips.length}) — revisar manualmente ---`)
    skips.forEach(s => console.log(`  ${s}`))
  }
}

main().catch(e => { console.error('Erro fatal:', e.message); process.exit(1) })
