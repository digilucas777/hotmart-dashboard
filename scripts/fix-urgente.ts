/**
 * Equivalente ao SQL de restauração urgente:
 * Corrige vendas com valor < 5 onde commissions-soma (exceto MARKETPLACE) > 5.
 * Não toca em Joyce / Weekly / Videos Semanais.
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PAGE_SIZE = 1000

function roundMoney(v: number) { return parseFloat(v.toFixed(2)) }

function calcular(payload: any): number | null {
  const comms: any[] = payload?.data?.commissions ?? []
  const purchase     = payload?.data?.purchase

  if (comms.length > 0) {
    const soma = roundMoney(
      comms
        .filter((c: any) => String(c.source ?? '').toUpperCase() !== 'MARKETPLACE')
        .reduce((acc: number, c: any) => acc + Number(c.value ?? 0), 0)
    )
    if (soma > 5 && soma <= 5000) return soma
  }

  const base  = purchase?.hotmart_fee?.base
  const total = purchase?.hotmart_fee?.total
  if (base != null && total != null) {
    const b = Number(base)
    if (b > 5 && b <= 5000) {
      const liquido = roundMoney(b - Number(total))
      if (liquido > 5) return liquido
    }
  }

  return null
}

async function main() {
  console.log('=== Fix urgente: restaurar vendas com valor < 5 ===\n')

  let offset = 0, pagina = 0
  let totalLidas = 0, totalCorrigidas = 0, totalSkips = 0, totalErros = 0

  while (true) {
    pagina++
    const { data: vendas, error } = await sb
      .from('vendas')
      .select('id, hotmart_id, valor, moeda, produto, hotmart_payload')
      .not('hotmart_payload', 'is', null)
      .lt('valor', 5)
      .eq('status', 'approved')
      .not('produto', 'ilike', '%Joyce%')
      .not('produto', 'ilike', '%Weekly%')
      .not('produto', 'ilike', '%Videos Semanais%')
      .range(offset, offset + PAGE_SIZE - 1)
      .order('id')

    if (error) { console.error('Erro:', error.message); process.exit(1) }
    if (!vendas || vendas.length === 0) break

    totalLidas += vendas.length
    console.log(`--- Página ${pagina}: ${vendas.length} vendas ---`)

    for (const venda of vendas) {
      const hotmartId  = venda.hotmart_id as string
      const valorAtual = Number(venda.valor ?? 0)
      const valorNovo  = calcular(venda.hotmart_payload)

      if (valorNovo === null) {
        totalSkips++
        continue
      }

      const { error: err } = await sb
        .from('vendas')
        .update({ valor: valorNovo, valor_operacional_final: valorNovo })
        .eq('id', venda.id)

      if (err) {
        console.error(`  [ERRO] ${hotmartId}: ${err.message}`)
        totalErros++
      } else {
        const diff = roundMoney(valorNovo - valorAtual)
        console.log(`  [OK] ${hotmartId}: $${valorAtual} → $${valorNovo} (+${diff})`)
        totalCorrigidas++
      }
    }

    offset += PAGE_SIZE
    if (vendas.length < PAGE_SIZE) break
  }

  console.log('\n=== Resumo ===')
  console.log(`Lidas      : ${totalLidas}`)
  console.log(`Corrigidas : ${totalCorrigidas}`)
  console.log(`Skips      : ${totalSkips}`)
  console.log(`Erros      : ${totalErros}`)
}

main().catch(e => { console.error('Erro fatal:', e.message); process.exit(1) })
