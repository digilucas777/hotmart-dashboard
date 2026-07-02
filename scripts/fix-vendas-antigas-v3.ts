/**
 * Restaura valor de TODAS as vendas antigas (data_venda < 2026-07-02) com payload.
 * Fórmula correta (igual ao webhook original):
 *   BRL  → price.value - MARKETPLACE_commission
 *   USD  → sum(commissions exceto MARKETPLACE)
 * Zera comissao_coprodutor.
 *
 * Corrige o estrago dos scripts v1 e v2.
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DATA_CORTE  = '2026-07-02T00:00:00.000Z'
const PAGE_SIZE   = 500
const MAX_BASE    = 5000  // moedas exóticas → skip

const STATUS_ZERO = new Set(['abandoned', 'cancelled', 'refunded'])

function roundMoney(v: number) { return parseFloat(v.toFixed(2)) }
function sleep(ms: number)     { return new Promise(r => setTimeout(r, ms)) }

function calcularValor(
  payload: any,
  status: string,
): { valor: number; metodo: string } | null {

  if (STATUS_ZERO.has(status)) {
    return { valor: 0, metodo: 'status-zero' }
  }

  const dados    = payload?.data
  const purchase = dados?.purchase
  const comms: any[] = dados?.commissions ?? []
  const priceCurrency = String(purchase?.price?.currency_value ?? '').toUpperCase()

  if (priceCurrency === 'BRL') {
    // Fórmula original do webhook para BRL: price.value - MARKETPLACE
    const priceValue  = Number(purchase?.price?.value ?? 0)
    const marketplace = comms
      .filter((c: any) => String(c.source ?? '').toUpperCase() === 'MARKETPLACE')
      .reduce((acc: number, c: any) => acc + Number(c.value ?? 0), 0)

    if (priceValue > 0 && priceValue <= MAX_BASE) {
      const liquido = roundMoney(priceValue - marketplace)
      return { valor: liquido, metodo: `BRL:price(${priceValue})-mkt(${marketplace})=${liquido}` }
    }
    return null
  }

  // USD e outras moedas: soma commissions exceto MARKETPLACE
  // (inclui PRODUCER + CO_PRODUCTION + AFFILIATE — o total líquido)
  if (comms.length > 0) {
    const soma = roundMoney(
      comms
        .filter((c: any) => String(c.source ?? '').toUpperCase() !== 'MARKETPLACE')
        .reduce((acc: number, c: any) => acc + Number(c.value ?? 0), 0)
    )
    if (soma > 0 && soma <= MAX_BASE) {
      return { valor: soma, metodo: `USD/commissions-soma=${soma}` }
    }
  }

  // Fallback: hotmart_fee.base - hotmart_fee.total (raro no payload do webhook)
  const feeBase  = purchase?.hotmart_fee?.base
  const feeTotal = purchase?.hotmart_fee?.total
  if (feeBase != null && feeTotal != null) {
    const baseNum = Number(feeBase)
    if (baseNum > 0 && baseNum <= MAX_BASE) {
      const liquido = roundMoney(baseNum - Number(feeTotal))
      if (liquido > 0) return { valor: liquido, metodo: `fee.base-fee.total=${liquido}` }
    }
  }

  return null
}

async function main() {
  console.log('=== Fix v3: restaurar valor correto para vendas antigas ===')
  console.log(`Critério: data_venda < ${DATA_CORTE}  +  hotmart_payload not null`)
  console.log('Fórmula BRL: price.value - MARKETPLACE | USD: commissions-soma\n')

  let offset = 0
  let pagina = 0
  let totalLidas      = 0
  let totalCorrigidas = 0
  let totalSemMudanca = 0
  let totalSkips      = 0
  let totalErros      = 0
  const skips: string[] = []

  while (true) {
    pagina++
    const { data: vendas, error } = await sb
      .from('vendas')
      .select('id, hotmart_id, valor, moeda, status, comissao_coprodutor, hotmart_payload')
      .lt('data_venda', DATA_CORTE)
      .not('hotmart_payload', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1)
      .order('id')

    if (error) { console.error('Erro ao buscar:', error.message); process.exit(1) }
    if (!vendas || vendas.length === 0) break

    totalLidas += vendas.length
    console.log(`--- Página ${pagina}: ${vendas.length} vendas ---`)

    for (const venda of vendas) {
      const hotmartId   = venda.hotmart_id as string
      const valorAtual  = Number(venda.valor ?? 0)
      const status      = (venda.status as string) ?? 'approved'
      const coprodAtual = Number(venda.comissao_coprodutor ?? 0)

      const resultado = calcularValor(venda.hotmart_payload, status)

      if (!resultado) {
        console.log(`  [SKIP] ${hotmartId}: sem dados (valor=${valorAtual} moeda=${venda.moeda})`)
        skips.push(`${hotmartId} (valor=${valorAtual} moeda=${venda.moeda})`)
        totalSkips++
        continue
      }

      const { valor: valorNovo, metodo } = resultado
      const valorMudou  = Math.abs(valorNovo - valorAtual) > 0.01
      const coprodMudou = coprodAtual !== 0

      if (!valorMudou && !coprodMudou) {
        totalSemMudanca++
        continue
      }

      const updates: Record<string, number> = {}
      if (valorMudou)  { updates.valor = valorNovo; updates.valor_operacional_final = valorNovo }
      if (coprodMudou) { updates.comissao_coprodutor = 0 }

      const { error: updateError } = await sb
        .from('vendas')
        .update(updates)
        .eq('id', venda.id)

      if (updateError) {
        console.error(`  [ERRO] ${hotmartId}: ${updateError.message}`)
        totalErros++
      } else {
        const diff   = roundMoney(valorNovo - valorAtual)
        const sinal  = diff >= 0 ? '+' : ''
        const valMsg = valorMudou  ? `${valorAtual} → ${valorNovo} (${sinal}${diff})` : `valor inalterado (${valorAtual})`
        const copMsg = coprodMudou ? ` | coprod: ${coprodAtual} → 0` : ''
        console.log(`  [OK] ${hotmartId}: ${valMsg}${copMsg} [${metodo}]`)
        totalCorrigidas++
      }

      await sleep(50)
    }

    offset += PAGE_SIZE
    if (vendas.length < PAGE_SIZE) break
  }

  console.log('\n=== Resumo ===')
  console.log(`Lidas      : ${totalLidas}`)
  console.log(`Corrigidas : ${totalCorrigidas}`)
  console.log(`Sem mudança: ${totalSemMudanca}`)
  console.log(`Skips      : ${totalSkips}`)
  console.log(`Erros      : ${totalErros}`)

  if (skips.length > 0) {
    console.log(`\n--- [SKIP] (${skips.length}) ---`)
    skips.forEach(s => console.log(`  ${s}`))
  }
}

main().catch(e => { console.error('Erro fatal:', e.message); process.exit(1) })
