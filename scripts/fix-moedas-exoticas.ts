/**
 * Corrige vendas antigas com moeda exótica (ARS, MXN, COP, PYG, CLP, etc).
 * Fórmula correta: original_offer_price.value (já em USD) - MARKETPLACE_commission_USD
 * Identifica registros pelo campo hotmart_payload.data.purchase.price.currency_value
 * que não seja USD nem BRL.
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PAGE_SIZE = 500
const MAX_VAL   = 5000

function roundMoney(v: number) { return parseFloat(v.toFixed(2)) }
function sleep(ms: number)     { return new Promise(r => setTimeout(r, ms)) }

function calcularExotica(payload: any): { valor: number; moeda: string; metodo: string } | null {
  const dados    = payload?.data
  const purchase = dados?.purchase
  const comms: any[] = dados?.commissions ?? []

  const priceCurrency = String(purchase?.price?.currency_value ?? '').toUpperCase()
  if (priceCurrency === 'USD' || priceCurrency === 'BRL' || priceCurrency === '') return null

  const origOfferValue = Number(purchase?.original_offer_price?.value ?? 0)
  if (origOfferValue <= 0 || origOfferValue > MAX_VAL) return null

  const marketplace = comms
    .filter((c: any) => String(c.currency_value ?? '').toUpperCase() === 'USD'
                     && String(c.source ?? '').toUpperCase() === 'MARKETPLACE')
    .reduce((acc: number, c: any) => acc + Number(c.value ?? 0), 0)

  const liquido = roundMoney(origOfferValue - marketplace)
  if (liquido <= 0) return null

  return {
    valor: liquido,
    moeda: priceCurrency,
    metodo: `${priceCurrency}:origOffer(${origOfferValue})-mkt(${marketplace})=${liquido}`,
  }
}

async function main() {
  console.log('=== Fix moedas exóticas: original_offer_price - MARKETPLACE ===\n')

  let offset = 0, pagina = 0
  let totalLidas = 0, totalCorrigidas = 0, totalSemMudanca = 0, totalSkips = 0, totalErros = 0
  const skips: string[] = []

  while (true) {
    pagina++
    const { data: vendas, error } = await sb
      .from('vendas')
      .select('id, hotmart_id, valor, moeda, status, hotmart_payload')
      .not('hotmart_payload', 'is', null)
      .eq('status', 'approved')
      .range(offset, offset + PAGE_SIZE - 1)
      .order('id')

    if (error) { console.error('Erro ao buscar:', error.message); process.exit(1) }
    if (!vendas || vendas.length === 0) break

    pagina > 1 || console.log(`Buscando páginas...`)
    totalLidas += vendas.length

    for (const venda of vendas) {
      const hotmartId  = venda.hotmart_id as string
      const valorAtual = Number(venda.valor ?? 0)

      const resultado = calcularExotica(venda.hotmart_payload)
      if (!resultado) { totalSkips++; continue }

      const { valor: valorNovo, metodo } = resultado
      if (Math.abs(valorNovo - valorAtual) <= 0.01) { totalSemMudanca++; continue }

      const { error: err } = await sb
        .from('vendas')
        .update({ valor: valorNovo, valor_operacional_final: valorNovo })
        .eq('id', venda.id)

      if (err) {
        console.error(`  [ERRO] ${hotmartId}: ${err.message}`)
        totalErros++
      } else {
        const diff  = roundMoney(valorNovo - valorAtual)
        const sinal = diff >= 0 ? '+' : ''
        console.log(`  [OK] ${hotmartId}: $${valorAtual} → $${valorNovo} (${sinal}${diff}) [${metodo}]`)
        totalCorrigidas++
      }

      await sleep(50)
    }

    console.log(`  Página ${pagina}: ${vendas.length} lidas | corrigidas até agora: ${totalCorrigidas}`)
    offset += PAGE_SIZE
    if (vendas.length < PAGE_SIZE) break
  }

  console.log('\n=== Resumo ===')
  console.log(`Lidas      : ${totalLidas}`)
  console.log(`Corrigidas : ${totalCorrigidas}`)
  console.log(`Sem mudança: ${totalSemMudanca}`)
  console.log(`Skips (USD/BRL/sem origOffer): ${totalSkips}`)
  console.log(`Erros      : ${totalErros}`)

  if (skips.length > 0) {
    console.log(`\n--- [SKIP] ---`)
    skips.forEach(s => console.log(`  ${s}`))
  }
}

main().catch(e => { console.error('Erro fatal:', e.message); process.exit(1) })
