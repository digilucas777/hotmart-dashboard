import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const BATCH_SIZE = 100
const PAGE_SIZE = 1000

function roundMoney(value: number) {
  return parseFloat(value.toFixed(2))
}

interface Valores {
  valor_bruto: number
  taxa_hotmart: number
  comissao_produtor: number
  comissao_coprodutor: number
  comissao_afiliado: number
  valor_recebido: number
  valor: number
  valor_operacional_final: number
}

function recalcular(payload: any, status: string): Valores | null {
  const dados = payload?.data
  if (!dados) return null

  const priceCurrency: string = dados.purchase?.price?.currency_value ?? ''
  // Só aplica a fix em moedas estrangeiras (não BRL, não USD)
  if (priceCurrency === 'BRL' || priceCurrency === 'USD') return null

  const commissions: any[] = dados.commissions ?? []
  const comissionsUSD = commissions.filter((c: any) => c.currency_value === 'USD')
  if (comissionsUSD.length === 0) return null

  const valorBruto = roundMoney(comissionsUSD.reduce((s: number, c: any) => s + Number(c.value), 0))
  const taxaHotmart = Number(commissions.find((c: any) => c.source === 'MARKETPLACE')?.value ?? 0)
  const comissaoProdutor = Number(commissions.find((c: any) => c.source === 'PRODUCER')?.value ?? 0)
  const comissaoCoprodutor = Number(commissions.find((c: any) => c.source === 'CO_PRODUCTION')?.value ?? 0)
  const comissaoAfiliado = Number(commissions.find((c: any) => c.source === 'AFFILIATE')?.value ?? 0)
  const valorOperacionalFinal = status === 'abandoned' ? 0 : roundMoney(valorBruto - taxaHotmart)

  return {
    valor_bruto: valorBruto,
    taxa_hotmart: taxaHotmart,
    comissao_produtor: comissaoProdutor,
    comissao_coprodutor: comissaoCoprodutor,
    comissao_afiliado: comissaoAfiliado,
    valor_recebido: comissaoProdutor,
    valor: valorOperacionalFinal,
    valor_operacional_final: valorOperacionalFinal,
  }
}

async function fix() {
  console.log('=== Fix: recalcular valores usando commissions do payload Hotmart ===\n')
  console.log('Alvo: vendas com moeda estrangeira (EUR, MXN, GBP, etc.) salvas com valor errado\n')

  let offset = 0
  let pagina = 0
  let totalProcessadas = 0
  let totalAtualizadas = 0
  let totalIgnoradas = 0
  let totalErros = 0

  while (true) {
    pagina++
    const { data: vendas, error } = await supabase
      .from('vendas')
      .select('id, hotmart_id, status, valor_bruto, taxa_hotmart, valor, hotmart_payload')
      .not('hotmart_payload', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) {
      console.error('Erro ao buscar vendas:', error.message)
      process.exit(1)
    }

    if (!vendas || vendas.length === 0) break

    console.log(`--- Página ${pagina}: ${vendas.length} vendas ---`)

    type Update = { id: string; hotmart_id: string; valores: Valores; valorAtual: number; valorNovo: number }
    const updates: Update[] = []

    for (const venda of vendas) {
      totalProcessadas++
      const valores = recalcular(venda.hotmart_payload, venda.status ?? '')
      if (!valores) {
        totalIgnoradas++
        continue
      }

      const semDiferenca =
        Math.abs((venda.valor_bruto ?? 0) - valores.valor_bruto) < 0.01 &&
        Math.abs((venda.taxa_hotmart ?? 0) - valores.taxa_hotmart) < 0.01 &&
        Math.abs((venda.valor ?? 0) - valores.valor) < 0.01

      if (semDiferenca) {
        totalIgnoradas++
        continue
      }

      updates.push({ id: venda.id, hotmart_id: venda.hotmart_id, valores, valorAtual: venda.valor, valorNovo: valores.valor })
    }

    if (updates.length === 0) {
      console.log('  Nenhuma atualização necessária nesta página.\n')
      offset += PAGE_SIZE
      if (vendas.length < PAGE_SIZE) break
      continue
    }

    // Processa em lotes de BATCH_SIZE
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const lote = updates.slice(i, i + BATCH_SIZE)
      console.log(`  Lote ${Math.floor(i / BATCH_SIZE) + 1} de ${Math.ceil(updates.length / BATCH_SIZE)}: ${lote.length} registros`)

      for (const u of lote) {
        const { error: updateError } = await supabase
          .from('vendas')
          .update(u.valores)
          .eq('id', u.id)

        if (updateError) {
          console.error(`  [ERRO] ${u.hotmart_id}: ${updateError.message}`)
          totalErros++
        } else {
          const diff = roundMoney(u.valorNovo - (u.valorAtual ?? 0))
          console.log(
            `  [OK] ${u.hotmart_id}: valor ${u.valorAtual ?? '?'} → ${u.valorNovo} USD` +
            ` (bruto: ${u.valores.valor_bruto}, taxa: ${u.valores.taxa_hotmart}, Δ: ${diff > 0 ? '+' : ''}${diff})`
          )
          totalAtualizadas++
        }
      }
    }

    console.log()
    offset += PAGE_SIZE
    if (vendas.length < PAGE_SIZE) break
  }

  console.log('=== Resumo ===')
  console.log(`Total processadas : ${totalProcessadas}`)
  console.log(`Total atualizadas : ${totalAtualizadas}`)
  console.log(`Total ignoradas   : ${totalIgnoradas}  (BRL/USD ou valor já correto)`)
  console.log(`Total erros       : ${totalErros}`)
}

fix().catch(err => {
  console.error('Erro fatal:', err.message)
  process.exit(1)
})
