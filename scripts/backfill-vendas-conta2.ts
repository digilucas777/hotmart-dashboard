import { createClient } from '@supabase/supabase-js'

const CLIENT_ID = process.env.HOTMART_CLIENT_ID_2
const CLIENT_SECRET = process.env.HOTMART_CLIENT_SECRET_2
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Parâmetro opcional: node -r ts-node/register scripts/backfill-vendas-conta2.ts <produto_id>
const PRODUTO_ID_FILTRO = process.argv[2] ?? null

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('HOTMART_CLIENT_ID_2 e HOTMART_CLIENT_SECRET_2 são obrigatórios.')
  process.exit(1)
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const DELAY_MS = 300
const MAX_RESULTS = 500

const COMMISSION_TYPES = ['PRODUCER', 'MARKETPLACE', 'AFFILIATE', 'COPRODUCER', 'SELLER', 'VENDOR', 'OWNER']

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getToken(): Promise<string> {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
  const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Auth falhou [${res.status}]: ${body}`)
  }
  const data = await res.json()
  return data.access_token
}

function extractOrigem(purchase: any, commissions: any[]): string | null {
  const origemObj = purchase?.origin
  const commissionSource = commissions?.[0]?.source
  const commissionSourceClean =
    commissionSource &&
    !COMMISSION_TYPES.some(t => String(commissionSource).toUpperCase().includes(t))
      ? String(commissionSource)
      : null
  const source =
    purchase?.tracking?.source ??
    purchase?.tracking?.external_reference ??
    purchase?.tracking_parameters?.utm_source ??
    (typeof origemObj === 'object' && origemObj !== null
      ? (origemObj.src ?? origemObj.sck ?? null)
      : typeof origemObj === 'string' ? origemObj : null) ??
    commissionSourceClean ??
    null
  return source && typeof source === 'string' && source.trim() !== '' ? source.trim() : null
}

function sameCurrencyValue(
  commissions: any[],
  currency: string,
  matcher: (source: string) => boolean,
): number {
  return commissions
    .filter(c => c.currency_value === currency && matcher(String(c.source ?? '').toUpperCase()))
    .reduce((sum, c) => sum + (Number(c.value) || 0), 0)
}

function roundMoney(value: number) {
  return parseFloat(value.toFixed(2))
}

function mapStatus(apiStatus: string): string {
  const map: Record<string, string> = {
    APPROVED: 'approved',
    COMPLETE: 'approved',
    REFUNDED: 'refunded',
    CANCELED: 'cancelled',
    CANCELLED: 'cancelled',
    DELAYED: 'pending',
    ABANDONED: 'abandoned',
    CHARGEBACK: 'refunded',
    PROTEST: 'refunded',
  }
  return map[String(apiStatus).toUpperCase()] ?? 'pending'
}

function buildVenda(item: any): Record<string, any> | null {
  const purchase = item?.purchase
  const buyer = item?.buyer
  const product = item?.product
  const commissions: any[] = item?.commissions ?? []
  const affiliates: any[] = item?.affiliates ?? []
  const subscription = item?.subscription

  const transaction: string | null = purchase?.transaction ?? null
  if (!transaction) return null

  const priceCurrency: string = purchase?.price?.currency_value ?? 'BRL'
  const somaUSD = commissions
    .filter(c => c.currency_value === 'USD')
    .reduce((s: number, c) => s + Number(c.value), 0)

  let moeda: string
  let valorBruto: number
  let taxaHotmart: number
  let comissaoProdutor: number
  let coproducerCommission: number
  let comissaoAfiliado: number

  if (priceCurrency === 'BRL') {
    moeda = 'BRL'
    valorBruto = Number(purchase?.price?.value ?? 0)
    taxaHotmart = sameCurrencyValue(commissions, 'BRL', s => s === 'MARKETPLACE')
    comissaoProdutor = sameCurrencyValue(
      commissions,
      'BRL',
      s => s === 'PRODUCER' || s === 'SELLER' || s === 'VENDOR' || s.includes('OWNER'),
    )
    coproducerCommission = sameCurrencyValue(
      commissions,
      'BRL',
      s => s.includes('COPRODUCER') || s.includes('CO_PRODUCER') || s.includes('CO-PRODUCER') || s.includes('COPRODUTOR'),
    )
    comissaoAfiliado = sameCurrencyValue(
      commissions,
      'BRL',
      s => s.includes('AFFILIATE') || s.includes('AFILIADO'),
    )
  } else if (priceCurrency === 'USD') {
    moeda = 'USD'
    valorBruto = Number(purchase?.price?.value ?? 0)
    taxaHotmart = sameCurrencyValue(commissions, 'USD', s => s === 'MARKETPLACE')
    comissaoProdutor = valorBruto
    coproducerCommission = sameCurrencyValue(
      commissions,
      'USD',
      s => s.includes('COPRODUCER') || s.includes('CO_PRODUCER') || s.includes('CO-PRODUCER') || s.includes('COPRODUTOR'),
    )
    comissaoAfiliado = sameCurrencyValue(
      commissions,
      'USD',
      s => s.includes('AFFILIATE') || s.includes('AFILIADO'),
    )
  } else {
    moeda = 'USD'
    const origOffer = purchase?.original_offer_price
    const taxaHotmartUSD = sameCurrencyValue(commissions, 'USD', s => s === 'MARKETPLACE')
    if (origOffer?.currency_value === 'USD') {
      valorBruto = Number(origOffer.value) || 0
    } else {
      const rate = commissions.find(c => c.currency_conversion?.conversion_rate)?.currency_conversion?.conversion_rate
      const priceValue = origOffer?.value ?? purchase?.price?.value
      valorBruto = rate ? roundMoney(Number(priceValue) / rate) : somaUSD
    }
    taxaHotmart = taxaHotmartUSD
    comissaoProdutor = valorBruto
    coproducerCommission = sameCurrencyValue(
      commissions,
      'USD',
      s => s.includes('COPRODUCER') || s.includes('CO_PRODUCER') || s.includes('CO-PRODUCER') || s.includes('COPRODUTOR'),
    )
    comissaoAfiliado = sameCurrencyValue(
      commissions,
      'USD',
      s => s.includes('AFFILIATE') || s.includes('AFILIADO'),
    )
  }

  const status = mapStatus(purchase?.status ?? '')
  const valorOperacionalFinal = status === 'abandoned' ? 0 : roundMoney(valorBruto - taxaHotmart)

  const paymentType: string | null = purchase?.payment?.type ?? null
  const cardBrand: string | null = purchase?.payment?.card_type ?? purchase?.payment?.brand ?? null
  const forma_pagamento = cardBrand ? `${paymentType}|${cardBrand}` : paymentType

  const origem = extractOrigem(purchase, commissions)

  const offer = purchase?.offer
  const oferta_codigo: string | null = offer?.code ? String(offer.code) : null
  const oferta_nome: string | null = offer?.name ? String(offer.name) : null
  const oferta_descricao: string | null = offer?.description ? String(offer.description) : null
  const oferta_preco: number | null =
    purchase?.original_offer_price?.value != null
      ? Number(purchase.original_offer_price.value)
      : purchase?.price?.value != null
        ? Number(purchase.price.value)
        : null
  const oferta_moeda: string | null =
    purchase?.original_offer_price?.currency_value ?? purchase?.price?.currency_value ?? null

  return {
    hotmart_id: transaction,
    hotmart_produto_id: product?.id ? String(product.id) : null,
    produto: product?.name ?? null,
    oferta_codigo,
    oferta_nome,
    oferta_descricao,
    oferta_preco,
    oferta_moeda,
    plano_id: subscription?.plan?.id ? String(subscription.plan.id) : null,
    plano_nome: subscription?.plan?.name ? String(subscription.plan.name) : null,
    comprador_nome: buyer?.name ?? null,
    comprador_email: buyer?.email ?? null,
    valor: valorOperacionalFinal,
    moeda,
    status,
    pais: buyer?.address?.country ?? null,
    forma_pagamento,
    origem,
    afiliado_nome: affiliates?.[0]?.name ?? null,
    valor_recebido: comissaoProdutor,
    valor_bruto: valorBruto,
    taxa_hotmart: taxaHotmart,
    comissao_produtor: comissaoProdutor,
    comissao_coprodutor: coproducerCommission,
    comissao_afiliado: comissaoAfiliado,
    valor_operacional_final: valorOperacionalFinal,
    data_venda: purchase?.order_date
      ? new Date(purchase.order_date).toISOString()
      : new Date().toISOString(),
  }
}

async function fetchPage(
  token: string,
  startDate: number,
  endDate: number,
  pageToken?: string,
): Promise<{ items: any[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    start_date: String(startDate),
    end_date: String(endDate),
    max_results: String(MAX_RESULTS),
  })
  if (PRODUTO_ID_FILTRO) params.set('product_id', PRODUTO_ID_FILTRO)
  if (pageToken) params.set('page_token', pageToken)

  const url = `https://developers.hotmart.com/payments/api/v1/sales/history?${params}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Hotmart API falhou [${res.status}]: ${body}`)
  }

  const data = await res.json()
  return {
    items: data?.items ?? [],
    nextPageToken: data?.page_info?.next_page_token ?? undefined,
  }
}

async function backfill() {
  console.log('=== Backfill Vendas — Conta 2 ===')
  if (PRODUTO_ID_FILTRO) console.log(`Filtro de produto: ${PRODUTO_ID_FILTRO}`)
  console.log()

  console.log('Autenticando na Hotmart API (conta 2)...')
  const token = await getToken()
  console.log('Token obtido.\n')

  const endDate = Date.now()
  const startDate = endDate - 90 * 24 * 60 * 60 * 1000

  console.log(`Período: ${new Date(startDate).toISOString().slice(0, 10)} → ${new Date(endDate).toISOString().slice(0, 10)}`)
  console.log()

  let totalBuscadas = 0
  let totalSalvas = 0
  let totalDuplicatas = 0
  let totalErros = 0
  let pageToken: string | undefined

  let pagina = 0
  do {
    pagina++
    console.log(`--- Página ${pagina} ---`)

    let items: any[]
    try {
      const page = await fetchPage(token, startDate, endDate, pageToken)
      items = page.items
      pageToken = page.nextPageToken
    } catch (err: any) {
      console.error(`Erro ao buscar página ${pagina}: ${err.message}`)
      break
    }

    if (items.length === 0) {
      console.log('Nenhum item nesta página.')
      break
    }

    console.log(`${items.length} venda(s) recebidas.`)
    totalBuscadas += items.length

    // Upsert produtos novos
    const produtos = items
      .filter(i => i?.product?.id && i?.product?.name)
      .map(i => ({ hotmart_id: String(i.product.id), nome: i.product.name }))
    if (produtos.length > 0) {
      await supabase.from('produtos').upsert(produtos, { onConflict: 'hotmart_id' })
    }

    for (const item of items) {
      const venda = buildVenda(item)
      if (!venda) {
        console.log(`[SKIP] Item sem transaction ID`)
        totalErros++
        continue
      }

      const { error } = await supabase
        .from('vendas')
        .upsert(venda, { onConflict: 'hotmart_id' })

      if (error) {
        // Fallback para schema legado
        if (error.message.includes('schema cache') || error.message.includes('valor_operacional_final')) {
          const legacyVenda: Record<string, any> = { ...venda }
          for (const col of [
            'valor_bruto', 'taxa_hotmart', 'comissao_produtor', 'comissao_afiliado',
            'valor_operacional_final', 'oferta_codigo', 'oferta_nome', 'oferta_descricao',
            'oferta_preco', 'oferta_moeda', 'plano_id', 'plano_nome',
          ]) delete legacyVenda[col]

          const retry = await supabase.from('vendas').upsert(legacyVenda, { onConflict: 'hotmart_id' })
          if (retry.error) {
            console.error(`[ERRO] ${venda.hotmart_id}: ${retry.error.message}`)
            totalErros++
          } else {
            console.log(`[SALVO-LEGACY] ${venda.hotmart_id} | ${venda.status} | ${venda.moeda} ${venda.valor_bruto}`)
            totalSalvas++
          }
        } else {
          console.error(`[ERRO] ${venda.hotmart_id}: ${error.message}`)
          totalErros++
        }
      } else {
        console.log(`[SALVO] ${venda.hotmart_id} | ${venda.status} | ${venda.moeda} ${venda.valor_bruto} | origem: ${venda.origem ?? '-'}`)
        totalSalvas++
      }

      await sleep(DELAY_MS)
    }
  } while (pageToken)

  console.log('\n=== Resumo ===')
  console.log(`Total buscadas  : ${totalBuscadas}`)
  console.log(`Total salvas    : ${totalSalvas}`)
  console.log(`Total duplicatas: ${totalDuplicatas}`)
  console.log(`Total erros     : ${totalErros}`)
}

backfill().catch(err => {
  console.error('Erro fatal:', err.message)
  process.exit(1)
})
