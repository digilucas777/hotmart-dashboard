/**
 * Corrige vendas com has_co_production=true cujo comissao_coprodutor está zerado.
 * Busca o PRODUCER da conta 2 na API Hotmart e recalcula:
 *   valor = PRODUCER(conta1) + PRODUCER(conta2) + AFFILIATE(conta1)
 */
import { createClient } from '@supabase/supabase-js'

const CLIENT_ID_1 = process.env.HOTMART_CLIENT_ID!
const CLIENT_SECRET_1 = process.env.HOTMART_CLIENT_SECRET!
const CLIENT_ID_2 = process.env.HOTMART_CLIENT_ID_2!
const CLIENT_SECRET_2 = process.env.HOTMART_CLIENT_SECRET_2!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

for (const [name, val] of [
  ['HOTMART_CLIENT_ID', CLIENT_ID_1],
  ['HOTMART_CLIENT_SECRET', CLIENT_SECRET_1],
  ['HOTMART_CLIENT_ID_2', CLIENT_ID_2],
  ['HOTMART_CLIENT_SECRET_2', CLIENT_SECRET_2],
  ['NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_KEY],
] as [string, string][]) {
  if (!val) {
    console.error(`${name} é obrigatório.`)
    process.exit(1)
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const DELAY_MS = 350
const PAGE_SIZE = 500
const BATCH_SIZE = 100

function roundMoney(v: number) { return parseFloat(v.toFixed(2)) }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// Cache de tokens com expiração de 50 minutos
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

async function getToken(clientId: string, clientSecret: string): Promise<string | null> {
  const key = clientId
  const cached = tokenCache.get(key)
  if (cached && Date.now() < cached.expiresAt) return cached.token

  const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) {
    console.error(`Auth conta2 falhou: ${res.status} ${await res.text()}`)
    return null
  }
  const { access_token } = await res.json()
  if (!access_token) return null
  tokenCache.set(key, { token: access_token, expiresAt: Date.now() + 50 * 60 * 1000 })
  return access_token
}

async function fetchSaleItem(token: string, hotmartId: string): Promise<any | null> {
  const res = await fetch(
    `https://developers.hotmart.com/payments/api/v1/sales/history?transaction=${encodeURIComponent(hotmartId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`API [${res.status}]: ${await res.text()}`)
  }
  const data = await res.json()
  return data?.items?.[0] ?? null
}

async function fix() {
  console.log('=== Fix: coprodução — busca PRODUCER da conta 2 e corrige valor ===\n')

  let offset = 0
  let pagina = 0
  let totalLidas = 0
  let totalAlvo = 0
  let totalAtualizadas = 0
  let totalNaoEncontradas = 0
  let totalErros = 0

  while (true) {
    pagina++
    const { data: vendas, error } = await supabase
      .from('vendas')
      .select('id, hotmart_id, status, comissao_produtor, comissao_afiliado, comissao_coprodutor, valor, hotmart_payload')
      .not('hotmart_payload', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1)
      .order('id')

    if (error) {
      console.error('Erro ao buscar vendas:', error.message)
      process.exit(1)
    }
    if (!vendas || vendas.length === 0) break

    totalLidas += vendas.length
    console.log(`--- Página ${pagina}: ${vendas.length} vendas (total lidas: ${totalLidas}) ---`)

    // Filtra apenas vendas com has_co_production=true (está em data.product, não data.purchase)
    const alvos = vendas.filter(v => {
      const payload = v.hotmart_payload as any
      const val = payload?.data?.product?.has_co_production
      return val === true || val === 'true' || val === 1
    })

    console.log(`  → ${alvos.length} com has_co_production=true`)

    if (alvos.length === 0) {
      offset += PAGE_SIZE
      if (vendas.length < PAGE_SIZE) break
      continue
    }

    totalAlvo += alvos.length

    // Processa em lotes de BATCH_SIZE para logs organizados
    for (let i = 0; i < alvos.length; i += BATCH_SIZE) {
      const lote = alvos.slice(i, i + BATCH_SIZE)
      console.log(`  Lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(alvos.length / BATCH_SIZE)}: ${lote.length} registros`)

      for (const venda of lote) {
        const hotmartId: string = venda.hotmart_id
        const status: string = venda.status ?? 'approved'
        const comissaoProdutor1 = Number(venda.comissao_produtor ?? 0)
        const comissaoAfiliado1 = Number(venda.comissao_afiliado ?? 0)

        let token2: string | null = null
        try {
          token2 = await getToken(CLIENT_ID_2, CLIENT_SECRET_2)
        } catch (err: any) {
          console.error(`  [ERRO-AUTH] ${hotmartId}: ${err.message}`)
          totalErros++
          await sleep(DELAY_MS)
          continue
        }
        if (!token2) {
          console.error(`  [ERRO-AUTH] ${hotmartId}: token nulo`)
          totalErros++
          await sleep(DELAY_MS)
          continue
        }

        let item2: any = null
        try {
          item2 = await fetchSaleItem(token2, hotmartId)
        } catch (err: any) {
          // Se 401, tentar renovar token e retry
          if (err.message?.includes('401')) {
            tokenCache.delete(CLIENT_ID_2)
            try {
              token2 = await getToken(CLIENT_ID_2, CLIENT_SECRET_2)
              if (token2) item2 = await fetchSaleItem(token2, hotmartId)
            } catch {
              /* ignora */
            }
          }
          if (!item2) {
            console.error(`  [ERRO-API] ${hotmartId}: ${err.message}`)
            totalErros++
            await sleep(DELAY_MS)
            continue
          }
        }

        if (!item2) {
          // Transação não existe na conta 2 — pode ser produto só da conta 1
          console.log(`  [NÃO-ENCONTRADA] ${hotmartId}`)
          totalNaoEncontradas++
          await sleep(DELAY_MS)
          continue
        }

        const comms2: any[] = item2.commissions ?? []
        const conta2Producer = Number(comms2.find((c: any) => c.source === 'PRODUCER')?.value ?? 0)

        if (conta2Producer === 0) {
          console.log(`  [SEM-PRODUCER] ${hotmartId}: conta2 sem PRODUCER`)
          totalNaoEncontradas++
          await sleep(DELAY_MS)
          continue
        }

        // valor = PRODUCER(c1) + PRODUCER(c2) + AFFILIATE(c1), exceto abandoned
        const valorCorrigido = status === 'abandoned'
          ? 0
          : roundMoney(comissaoProdutor1 + conta2Producer + comissaoAfiliado1)

        const valorAtual = Number(venda.valor ?? 0)
        const diff = roundMoney(valorCorrigido - valorAtual)

        const { error: updateError } = await supabase
          .from('vendas')
          .update({
            comissao_coprodutor: conta2Producer,
            valor: valorCorrigido,
            valor_operacional_final: valorCorrigido,
          })
          .eq('id', venda.id)

        if (updateError) {
          console.error(`  [ERRO-DB] ${hotmartId}: ${updateError.message}`)
          totalErros++
        } else {
          const sinal = diff >= 0 ? '+' : ''
          console.log(
            `  [OK] ${hotmartId}: c1_prod=${comissaoProdutor1} + c2_prod=${conta2Producer} + afil=${comissaoAfiliado1}` +
            ` → valor ${valorAtual} → ${valorCorrigido} (${sinal}${diff})`
          )
          totalAtualizadas++
        }

        await sleep(DELAY_MS)
      }
    }

    offset += PAGE_SIZE
    if (vendas.length < PAGE_SIZE) break
  }

  console.log('\n=== Resumo ===')
  console.log(`Total lidas          : ${totalLidas}`)
  console.log(`Com has_co_production: ${totalAlvo}`)
  console.log(`Atualizadas          : ${totalAtualizadas}`)
  console.log(`Não encontradas c2   : ${totalNaoEncontradas}`)
  console.log(`Erros                : ${totalErros}`)
}

fix().catch(err => {
  console.error('Erro fatal:', err.message)
  process.exit(1)
})
