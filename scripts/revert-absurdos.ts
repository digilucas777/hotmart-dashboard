/**
 * Reverte vendas com valor absurdo (> 1000) gerado pelo fix-coproducao.ts.
 * Extrai o valor correto do hotmart_payload salvo no banco.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function roundMoney(v: number) { return parseFloat(v.toFixed(2)) }

const COMMISSION_SOURCES_EXCLUIR = ['MARKETPLACE']

/**
 * Extrai o valor correto a partir do payload do webhook.
 * Retorna { valor, metodo } ou null se não foi possível calcular.
 */
function extrairValorDoPayload(
  payload: any,
  valorRecebidoDB: number | null,
): { valor: number; metodo: string } | null {
  const dados = payload?.data
  if (!dados) return null

  const commissions: any[] = dados.commissions ?? []
  const purchase = dados.purchase

  // (a) commissions[] não vazio → soma todos exceto MARKETPLACE
  if (commissions.length > 0) {
    const soma = commissions
      .filter((c: any) => !COMMISSION_SOURCES_EXCLUIR.includes(String(c.source ?? '').toUpperCase()))
      .reduce((acc: number, c: any) => acc + Number(c.value ?? 0), 0)
    return { valor: roundMoney(soma), metodo: 'commissions-soma' }
  }

  // (b) commissions[] vazio E hotmart_fee.base existe
  const feeBase = purchase?.hotmart_fee?.base
  const feeTotal = purchase?.hotmart_fee?.total
  if (feeBase != null && feeTotal != null) {
    const liquido = roundMoney(Number(feeBase) - Number(feeTotal))
    return { valor: liquido, metodo: 'fee.base-fee.total' }
  }

  // (c) commissions[] vazio E hotmart_fee null → usa valor_recebido salvo no banco
  if (valorRecebidoDB != null && valorRecebidoDB > 0) {
    return { valor: roundMoney(valorRecebidoDB), metodo: 'valor_recebido-db' }
  }

  // (d) Nada funciona
  return null
}

async function main() {
  console.log('=== Revert: vendas com valor absurdo (> 1000) ===\n')

  // Busca em páginas (pode haver muitos)
  const PAGE_SIZE = 500
  let offset = 0
  let totalLidas = 0
  let totalAbsurdas = 0
  let totalRevertidas = 0
  let totalErros = 0
  const manuais: string[] = []

  while (true) {
    const { data: vendas, error } = await sb
      .from('vendas')
      .select('id, hotmart_id, valor, valor_recebido, comissao_coprodutor, hotmart_payload')
      .gt('valor', 1000)
      .range(offset, offset + PAGE_SIZE - 1)
      .order('valor', { ascending: false })

    if (error) {
      console.error('Erro ao buscar:', error.message)
      process.exit(1)
    }
    if (!vendas || vendas.length === 0) break

    totalLidas += vendas.length
    totalAbsurdas += vendas.length
    console.log(`--- Lote: ${vendas.length} vendas com valor > 1000 ---`)

    for (const venda of vendas) {
      const hotmartId: string = venda.hotmart_id
      const valorAtual = Number(venda.valor)
      const valorRecebido = venda.valor_recebido != null ? Number(venda.valor_recebido) : null
      const payload = venda.hotmart_payload as any

      // Para registros sem payload, tenta direto pelo valor_recebido do banco
      let resultado = extrairValorDoPayload(payload, valorRecebido)
      if (!resultado && payload == null && valorRecebido != null && valorRecebido > 0 && valorRecebido < 1000) {
        resultado = { valor: roundMoney(valorRecebido), metodo: 'valor_recebido-db (sem payload)' }
      }

      if (!resultado) {
        console.log(`  [MANUAL] ${hotmartId}: valor=${valorAtual} — não foi possível calcular automaticamente`)
        manuais.push(`${hotmartId} (valor atual: ${valorAtual}, valor_recebido: ${valorRecebido})`)
        continue
      }

      const { valor: valorCorrigido, metodo } = resultado

      // Sanity: valor corrigido também é absurdo → pula e marca manual
      if (valorCorrigido > 1000) {
        console.log(`  [MANUAL] ${hotmartId}: valor calculado ${valorCorrigido} ainda absurdo (método=${metodo}) — pulando`)
        manuais.push(`${hotmartId} (valor atual: ${valorAtual}, calculado: ${valorCorrigido}, método: ${metodo})`)
        continue
      }

      const { error: updateError } = await sb
        .from('vendas')
        .update({
          valor: valorCorrigido,
          valor_operacional_final: valorCorrigido,
          comissao_coprodutor: 0,
        })
        .eq('id', venda.id)

      if (updateError) {
        console.error(`  [ERRO] ${hotmartId}: ${updateError.message}`)
        totalErros++
      } else {
        console.log(`  [REVERTIDO] ${hotmartId}: valor $${valorAtual} → $${valorCorrigido} (${metodo})`)
        totalRevertidas++
      }
    }

    offset += PAGE_SIZE
    if (vendas.length < PAGE_SIZE) break
  }

  console.log('\n=== Resumo ===')
  console.log(`Vendas absurdas encontradas: ${totalAbsurdas}`)
  console.log(`Revertidas                 : ${totalRevertidas}`)
  console.log(`Erros                      : ${totalErros}`)
  console.log(`Manuais                    : ${manuais.length}`)

  if (manuais.length > 0) {
    console.log('\n--- [MANUAL] — requer revisão manual ---')
    manuais.forEach(m => console.log(`  ${m}`))
  }
}

main().catch(e => { console.error('Erro fatal:', e.message); process.exit(1) })
