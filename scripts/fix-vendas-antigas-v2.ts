/**
 * Corrige vendas antigas (data_venda < 2026-07-02) com a lógica correta:
 * Prioridade: hotmart_fee.base - hotmart_fee.total → sum commissions (exceto MARKETPLACE)
 * Zera comissao_coprodutor.
 * Corrige os erros deixados por fix-vendas-antigas.ts (v1).
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const DATA_CORTE = '2026-07-02T00:00:00.000Z'
const PAGE_SIZE  = 500
const MAX_BASE   = 5000  // acima disso: hotmart_fee.base em moeda local (ARS, COP…) → skip

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

  // (1) hotmart_fee.base - hotmart_fee.total  (já em USD/BRL)
  const feeBase  = purchase?.hotmart_fee?.base
  const feeTotal = purchase?.hotmart_fee?.total
  if (feeBase != null && feeTotal != null) {
    const baseNum = Number(feeBase)
    if (baseNum > MAX_BASE) return null  // moeda exótica em valor local → skip
    const liquido = roundMoney(baseNum - Number(feeTotal))
    if (liquido > 0) return { valor: liquido, metodo: `fee.base(${baseNum})-fee.total(${feeTotal})=${liquido}` }
  }

  // (2) commissions[] → soma todos exceto MARKETPLACE
  if (comms.length > 0) {
    const soma = roundMoney(
      comms
        .filter((c: any) => String(c.source ?? '').toUpperCase() !== 'MARKETPLACE')
        .reduce((acc: number, c: any) => acc + Number(c.value ?? 0), 0)
    )
    if (soma > 0) return { valor: soma, metodo: `commissions-soma=${soma}` }
  }

  return null
}

async function main() {
  console.log('=== Fix v2: corrigir vendas antigas com lógica correta (fee.base) ===')
  console.log(`Critério: data_venda < ${DATA_CORTE}  +  hotmart_payload não nulo\n`)

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
        console.log(`  [SKIP] ${hotmartId}: moeda exótica ou sem dados (valor=${valorAtual} moeda=${venda.moeda})`)
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
        const diff    = roundMoney(valorNovo - valorAtual)
        const sinal   = diff >= 0 ? '+' : ''
        const valMsg  = valorMudou  ? `${valorAtual} → ${valorNovo} (${sinal}${diff})` : `valor inalterado (${valorAtual})`
        const copMsg  = coprodMudou ? ` | coprod: ${coprodAtual} → 0` : ''
        console.log(`  [CORRIGIDO] ${hotmartId}: ${valMsg}${copMsg} [${metodo}]`)
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
    console.log(`\n--- [SKIP] (${skips.length}) — revisar manualmente ---`)
    skips.forEach(s => console.log(`  ${s}`))
  }
}

main().catch(e => { console.error('Erro fatal:', e.message); process.exit(1) })
