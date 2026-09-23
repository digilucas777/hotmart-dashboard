// Recupera vendas perdidas durante a janela em que o webhook da Hotmart
// exigiu hottok errado (2026-09-22, ~15:14 a ~16:55 UTC) e rejeitava com 401
// tudo que a Hotmart mandava. Busca na API oficial da Hotmart (fonte da
// verdade, não depende do webhook) o que realmente aconteceu nesse intervalo
// nas 3 contas, compara com `vendas` e insere/corrige o que faltar.
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const line of fs.readFileSync('C:/Users/User/hotmart-dashboard/.env.local', 'utf8').split('\n')) {
  const idx = line.indexOf('=')
  if (idx === -1) continue
  env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const ACCOUNTS = [
  { name: 'conta1 (Joyce)', id: env.HOTMART_CLIENT_ID, secret: env.HOTMART_CLIENT_SECRET },
  { name: 'conta2 (Joy Marketing)', id: env.HOTMART_CLIENT_ID_2, secret: env.HOTMART_CLIENT_SECRET_2 },
  { name: 'conta3 (Borderless)', id: env.HOTMART_CLIENT_ID_3, secret: env.HOTMART_CLIENT_SECRET_3 },
].filter(a => a.id && a.secret)

// Buffer generoso em torno da janela real do incidente (deploy da checagem
// ~15:14 UTC, revertido ~16:55 UTC) pra cobrir qualquer diferença de relógio.
const START = new Date('2026-09-22T15:00:00Z').getTime()
const END = new Date('2026-09-22T17:10:00Z').getTime()
const STATUSES = ['COMPLETE', 'APPROVED', 'REFUNDED', 'CHARGEBACK', 'PROTESTED', 'CANCELLED', 'EXPIRED', 'STARTED', 'PRINTED_BILLET', 'WAITING_PAYMENT']

function roundMoney(v) { return parseFloat((v ?? 0).toFixed(2)) }

async function getToken(id, secret) {
  const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`auth falhou: ${res.status} ${await res.text()}`)
  return (await res.json()).access_token
}

async function fetchAllHistory(token, status) {
  const all = []
  let pageToken
  do {
    const params = new URLSearchParams({ start_date: String(START), end_date: String(END), max_results: '500', transaction_status: status })
    if (pageToken) params.set('page_token', pageToken)
    const res = await fetch(`https://developers.hotmart.com/payments/api/v1/sales/history?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      console.error(`  [${status}] erro ${res.status}: ${await res.text()}`)
      break
    }
    const data = await res.json()
    all.push(...(data?.items ?? []))
    pageToken = data?.page_info?.next_page_token ?? undefined
  } while (pageToken)
  return all
}

async function fetchCommissions(token, tx) {
  const res = await fetch(`https://developers.hotmart.com/payments/api/v1/sales/commissions?transaction=${encodeURIComponent(tx)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  return (await res.json())?.items?.[0] ?? null
}

function mapStatus(apiStatus) {
  const map = {
    APPROVED: 'approved', COMPLETE: 'approved', CANCELLED: 'cancelled', CANCELED: 'cancelled', EXPIRED: 'cancelled',
    REFUNDED: 'refunded', PARTIALLY_REFUNDED: 'refunded', CHARGEBACK: 'chargeback', PROTESTED: 'disputed', DISPUTE: 'disputed',
  }
  return map[String(apiStatus ?? '').toUpperCase()] ?? 'pending'
}

function extractOrigem(purchase, commissions) {
  const COMMISSION_TYPES = ['PRODUCER', 'MARKETPLACE', 'AFFILIATE', 'COPRODUCER', 'SELLER', 'VENDOR', 'OWNER']
  const origemObj = purchase?.origin
  const commissionSource = commissions?.[0]?.source
  const commissionSourceClean =
    commissionSource && !COMMISSION_TYPES.some(t => String(commissionSource).toUpperCase().includes(t))
      ? String(commissionSource) : null
  const source =
    purchase?.tracking?.source ?? purchase?.tracking?.external_reference ?? purchase?.tracking_parameters?.utm_source ??
    (typeof origemObj === 'object' && origemObj !== null ? (origemObj.src ?? origemObj.sck ?? null) : typeof origemObj === 'string' ? origemObj : null) ??
    commissionSourceClean ?? null
  return source && typeof source === 'string' && source.trim() !== '' ? source.trim() : null
}

async function main() {
  const hotmartItems = new Map() // transaction -> { item, account }

  for (const acc of ACCOUNTS) {
    console.log(`Autenticando ${acc.name}...`)
    let token
    try {
      token = await getToken(acc.id, acc.secret)
    } catch (e) {
      console.log(`  ${acc.name}: falha ao autenticar (${e.message}) — pulando`)
      continue
    }
    for (const status of STATUSES) {
      const items = await fetchAllHistory(token, status)
      if (items.length > 0) console.log(`  ${acc.name} / ${status}: ${items.length} itens`)
      for (const item of items) {
        const tx = item?.purchase?.transaction
        if (!tx) continue
        if (!hotmartItems.has(tx)) hotmartItems.set(tx, { item, account: acc.name, token })
      }
    }
  }
  console.log(`\nTotal de transações únicas na Hotmart nessa janela (todas as contas): ${hotmartItems.size}`)

  const { data: vendas, error } = await sb
    .from('vendas')
    .select('hotmart_id, status, valor_operacional_final, moeda, produto')
    .gte('data_venda', new Date(START).toISOString())
    .lt('data_venda', new Date(END).toISOString())
    .not('hotmart_id', 'is', null)
  if (error) throw error
  console.log(`Total de vendas já no dashboard nessa janela: ${vendas.length}`)

  const dashboardByTx = new Map(vendas.map(v => [v.hotmart_id, v]))

  const missing = []
  const statusMismatch = []
  for (const [tx, { item, account, token }] of hotmartItems) {
    const dbRow = dashboardByTx.get(tx)
    const realStatus = mapStatus(item.purchase?.status)
    if (!dbRow) missing.push({ tx, account, token, item })
    else if (dbRow.status !== realStatus) statusMismatch.push({ tx, account, token, item, dbRow })
  }

  console.log(`\n=== Faltando no dashboard: ${missing.length} ===`)
  console.log(`=== Status desatualizado no dashboard: ${statusMismatch.length} ===`)

  const relatorio = []

  async function buildVendaRow(item, commItem) {
    const purchase = item.purchase
    const commissions = (commItem?.commissions ?? []).map(c => ({
      source: c?.commission?.source ?? c?.source ?? '',
      value: Number(c?.commission?.value ?? c?.value ?? 0),
      currency_value: c?.commission?.currency_value ?? c?.currency_value ?? purchase?.price?.currency_value,
    }))
    // BUG CORRIGIDO (2026-09-23): a API de histórico de vendas da Hotmart retorna
    // o campo de moeda como `currency_code`, não `currency_value` (esse último é o
    // nome usado só no payload do webhook em tempo real). Como `currency_value`
    // nunca existe na resposta da API, isso sempre caía no fallback 'BRL' — toda
    // venda recuperada por este script virava R$ errado, não importa a moeda real.
    // Confirmado em produção: 14 vendas (3 do De Lucas + 11 do Pedro) gravadas
    // como BRL quando eram EUR/USD/CRC.
    const priceCurrency = purchase?.price?.currency_code ?? purchase?.price?.currency_value ?? 'BRL'
    const sameCurrencyValue = (currency, matcher) =>
      roundMoney(commissions.filter(c => c.currency_value === currency && matcher(String(c.source).toUpperCase())).reduce((s, c) => s + c.value, 0))

    let moeda, valorBruto, taxaHotmart, comissaoProdutor, coproducerCommission, comissaoAfiliado
    const isKnown = priceCurrency === 'BRL' || priceCurrency === 'USD'
    const curr = isKnown ? priceCurrency : 'USD'
    moeda = curr
    taxaHotmart = sameCurrencyValue(curr, s => s === 'MARKETPLACE')
    comissaoProdutor = sameCurrencyValue(curr, s => s === 'PRODUCER' || s === 'SELLER' || s === 'VENDOR' || s.includes('OWNER'))
    coproducerCommission = sameCurrencyValue(curr, s => s.includes('COPRODUCER') || s.includes('CO_PRODUCER') || s.includes('CO-PRODUCER') || s.includes('COPRODUTOR'))
    comissaoAfiliado = sameCurrencyValue(curr, s => s.includes('AFFILIATE') || s.includes('AFILIADO'))
    valorBruto = isKnown ? Number(purchase?.price?.value ?? 0) : sameCurrencyValue('USD', () => true)

    const status = mapStatus(purchase?.status)
    const valorOperacionalFinal = status === 'abandoned' ? 0 : roundMoney(valorBruto - taxaHotmart)

    const paymentType = purchase?.payment?.type ?? null
    const cardBrand = purchase?.payment?.card_type ?? purchase?.payment?.brand ?? null
    const forma_pagamento = cardBrand ? `${paymentType}|${cardBrand}` : paymentType

    const offer = purchase?.offer
    const origem = extractOrigem(purchase, item.commissions ?? [])
    const afiliado_nome = item.affiliates?.[0]?.name ?? purchase?.affiliates?.[0]?.name ?? null

    return {
      hotmart_id: purchase?.transaction,
      hotmart_produto_id: item.product?.id ? String(item.product.id) : null,
      produto: item.product?.name,
      oferta_codigo: offer?.code ? String(offer.code) : null,
      oferta_nome: offer?.name ? String(offer.name) : null,
      oferta_descricao: offer?.description ? String(offer.description) : null,
      oferta_preco: purchase?.original_offer_price?.value ?? purchase?.price?.value ?? null,
      oferta_moeda: purchase?.original_offer_price?.currency_value ?? purchase?.price?.currency_value ?? null,
      plano_id: item.subscription?.plan?.id ? String(item.subscription.plan.id) : null,
      plano_nome: item.subscription?.plan?.name ?? null,
      comprador_nome: item.buyer?.name,
      comprador_email: item.buyer?.email,
      valor: valorOperacionalFinal,
      moeda,
      status,
      pais: item.buyer?.address?.country ?? null,
      forma_pagamento,
      ...(origem ? { origem } : {}),
      ...(afiliado_nome ? { afiliado_nome } : {}),
      valor_recebido: comissaoProdutor,
      valor_bruto: valorBruto,
      taxa_hotmart: taxaHotmart,
      comissao_produtor: comissaoProdutor,
      comissao_coprodutor: coproducerCommission,
      comissao_afiliado: comissaoAfiliado,
      valor_operacional_final: valorOperacionalFinal,
      hotmart_payload: { recuperado_via_api: true, item, commissions: commItem },
      data_venda: purchase?.order_date ? new Date(purchase.order_date).toISOString() : new Date().toISOString(),
    }
  }

  for (const { tx, account, token, item } of missing) {
    const commItem = await fetchCommissions(token, tx)
    const venda = await buildVendaRow(item, commItem)
    const { error: insErr } = await sb.from('vendas').upsert(venda, { onConflict: 'hotmart_id' })
    relatorio.push({ tx, acao: 'inserida', conta: account, produto: venda.produto, status: venda.status, valor: venda.valor_operacional_final, moeda: venda.moeda, ok: !insErr, erro: insErr?.message })
    if (!insErr) {
      await sb.rpc('refresh_vendas_resumo_diario_by_hotmart_id', { p_hotmart_id: tx }).then(({ error: e }) => e && console.error('refresh erro:', e))
      await sb.rpc('refresh_vendas_distinct_by_hotmart_id', { p_hotmart_id: tx }).then(({ error: e }) => e && console.error('refresh distinct erro:', e))
    }
  }

  for (const { tx, account, token, item, dbRow } of statusMismatch) {
    const commItem = await fetchCommissions(token, tx)
    const venda = await buildVendaRow(item, commItem)
    delete venda.hotmart_id
    const { error: updErr } = await sb.from('vendas').update(venda).eq('hotmart_id', tx)
    relatorio.push({ tx, acao: 'status corrigido', conta: account, produto: venda.produto, status_antes: dbRow.status, status_depois: venda.status, valor: venda.valor_operacional_final, moeda: venda.moeda, ok: !updErr, erro: updErr?.message })
    if (!updErr) {
      await sb.rpc('refresh_vendas_resumo_diario_by_hotmart_id', { p_hotmart_id: tx }).then(({ error: e }) => e && console.error('refresh erro:', e))
    }
  }

  console.log('\n=== RELATORIO DE RECUPERACAO ===')
  console.table(relatorio)

  fs.writeFileSync(
    'C:\\Users\\User\\hotmart-dashboard\\.scratch\\recover_vendas_gap_20260922.json',
    JSON.stringify({ missing: missing.map(m => m.tx), statusMismatch: statusMismatch.map(m => m.tx), relatorio }, null, 2),
  )
  console.log('\nRelatório completo salvo em .scratch/recover_vendas_gap_20260922.json')
}
main().catch(e => { console.error('ERRO:', e); process.exit(1) })
