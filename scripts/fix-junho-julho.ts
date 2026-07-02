/**
 * Corrige vendas do período 2026-06-01 a 2026-07-01 com valor < 1.00 e status approved,
 * excluindo produtos Joyce/Weekly/Videos Semanais.
 * Fórmula: soma commissions exceto MARKETPLACE; fallback hotmart_fee.base - fee.total.
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PAGE_SIZE = 500
const MAX_BASE  = 5000

function roundMoney(v: number) { return parseFloat(v.toFixed(2)) }
function sleep(ms: number)     { return new Promise(r => setTimeout(r, ms)) }

function calcularValor(payload: any): { valor: number; metodo: string } | null {
  const dados    = payload?.data
  const purchase = dados?.purchase
  const comms: any[] = dados?.commissions ?? []

  // (1) commissions[] não vazio → soma PRODUCER + AFFILIATE + CO_PRODUCTION (exceto MARKETPLACE)
  if (comms.length > 0) {
    const soma = roundMoney(
      comms
        .filter((c: any) => String(c.source ?? '').toUpperCase() !== 'MARKETPLACE')
        .reduce((acc: number, c: any) => acc + Number(c.value ?? 0), 0)
    )
    if (soma > 0 && soma <= MAX_BASE) {
      return { valor: soma, metodo: `commissions-soma=${soma}` }
    }
  }

  // (2) commissions[] vazio → hotmart_fee.base - hotmart_fee.total
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
  console.log('=== Fix junho-julho: corrigir valor < 1.00 em 2026-06-01 a 2026-07-01 ===')
  console.log('Excluindo: Joyce, Weekly, Videos Semanais\n')

  let offset = 0
  let pagina = 0
  let totalLidas      = 0
  let totalCorrigidas = 0
  let totalSkips      = 0
  let totalErros      = 0
  const skips: string[] = []

  while (true) {
    pagina++
    const { data: vendas, error } = await sb
      .from('vendas')
      .select('id, hotmart_id, valor, moeda, produto, hotmart_payload')
      .gte('data_venda', '2026-06-01T00:00:00.000Z')
      .lt('data_venda', '2026-07-02T00:00:00.000Z')
      .lt('valor', 1.00)
      .eq('status', 'approved')
      .not('produto', 'ilike', '%Joyce%')
      .not('produto', 'ilike', '%Weekly%')
      .not('produto', 'ilike', '%Videos Semanais%')
      .range(offset, offset + PAGE_SIZE - 1)
      .order('id')

    if (error) { console.error('Erro ao buscar:', error.message); process.exit(1) }
    if (!vendas || vendas.length === 0) break

    totalLidas += vendas.length
    console.log(`--- Página ${pagina}: ${vendas.length} vendas ---`)

    for (const venda of vendas) {
      const hotmartId  = venda.hotmart_id as string
      const valorAtual = Number(venda.valor ?? 0)

      if (!venda.hotmart_payload) {
        console.log(`  [SKIP] ${hotmartId}: sem payload (valor=${valorAtual} moeda=${venda.moeda} produto=${venda.produto})`)
        skips.push(`${hotmartId} (sem payload)`)
        totalSkips++
        continue
      }

      const resultado = calcularValor(venda.hotmart_payload)

      if (!resultado) {
        console.log(`  [SKIP] ${hotmartId}: sem dados suficientes (valor=${valorAtual} moeda=${venda.moeda})`)
        skips.push(`${hotmartId} (sem dados)`)
        totalSkips++
        continue
      }

      const { valor: valorNovo, metodo } = resultado
      const diff  = roundMoney(valorNovo - valorAtual)
      const sinal = diff >= 0 ? '+' : ''

      const { error: updateError } = await sb
        .from('vendas')
        .update({ valor: valorNovo, valor_operacional_final: valorNovo })
        .eq('id', venda.id)

      if (updateError) {
        console.error(`  [ERRO] ${hotmartId}: ${updateError.message}`)
        totalErros++
      } else {
        console.log(`  [OK] ${hotmartId}: $${valorAtual} → $${valorNovo} (${sinal}${diff}) [${metodo}]`)
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
  console.log(`Skips      : ${totalSkips}`)
  console.log(`Erros      : ${totalErros}`)

  if (skips.length > 0) {
    console.log(`\n--- [SKIP] (${skips.length}) ---`)
    skips.forEach(s => console.log(`  ${s}`))
  }
}

main().catch(e => { console.error('Erro fatal:', e.message); process.exit(1) })
