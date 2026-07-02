import { createClient } from '@supabase/supabase-js'

const TRANSACTIONS = ['HP1030767792']

const ACCOUNTS = [
  { label: 'conta 1', id: process.env.HOTMART_CLIENT_ID!, secret: process.env.HOTMART_CLIENT_SECRET! },
  { label: 'conta 2', id: process.env.HOTMART_CLIENT_ID_2!, secret: process.env.HOTMART_CLIENT_SECRET_2! },
]

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`Auth falhou: ${res.status} ${await res.text()}`)
  const { access_token } = await res.json()
  return access_token
}

async function fetchTransaction(token: string, transaction: string) {
  const res = await fetch(
    `https://developers.hotmart.com/payments/api/v1/sales/history?transaction=${encodeURIComponent(transaction)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const data = await res.json()
  return { status: res.status, item: data?.items?.[0] ?? null }
}

async function main() {
  // Tokens
  const tokens: string[] = []
  for (const account of ACCOUNTS) {
    try {
      tokens.push(await getToken(account.id, account.secret))
      console.log(`Token ${account.label} OK`)
    } catch (e: any) {
      console.error(`Auth ${account.label} falhou:`, e.message)
      tokens.push('')
    }
  }

  // Payloads do banco
  const { data: vendas } = await supabase
    .from('vendas')
    .select('hotmart_id, valor, comissao_produtor, comissao_coprodutor, comissao_afiliado, taxa_hotmart, moeda, hotmart_payload')
    .in('hotmart_id', TRANSACTIONS)

  const vendaMap = Object.fromEntries((vendas ?? []).map(v => [v.hotmart_id, v]))

  console.log()

  for (const txId of TRANSACTIONS) {
    console.log('='.repeat(70))
    console.log(`Transação: ${txId}`)
    console.log('='.repeat(70))

    // --- Banco ---
    const venda = vendaMap[txId]
    if (venda) {
      console.log('\n  [BANCO]')
      console.log(`  valor              : ${venda.valor} ${venda.moeda}`)
      console.log(`  comissao_produtor  : ${venda.comissao_produtor}`)
      console.log(`  comissao_coprodutor: ${venda.comissao_coprodutor}`)
      console.log(`  comissao_afiliado  : ${venda.comissao_afiliado}`)
      console.log(`  taxa_hotmart       : ${venda.taxa_hotmart}`)
      const payload = venda.hotmart_payload as any
      const payloadCommissions = payload?.data?.commissions ?? []
      const hasCoprod = payload?.data?.product?.has_co_production
      console.log(`  has_co_production  : ${hasCoprod}`)
      console.log(`  payload.commissions: ${JSON.stringify(payloadCommissions, null, 4).split('\n').join('\n  ')}`)
    } else {
      console.log('\n  [BANCO] → não encontrado')
    }

    // --- API contas ---
    for (let i = 0; i < ACCOUNTS.length; i++) {
      const account = ACCOUNTS[i]
      const token = tokens[i]
      console.log(`\n  [API ${account.label}]`)

      if (!token) { console.log('  Token indisponível.'); continue }

      const { status, item } = await fetchTransaction(token, txId)
      console.log(`  HTTP: ${status}`)

      if (!item) { console.log('  → Não encontrado.'); continue }

      console.log(`  commission_as    : ${item.commission_as ?? '(não informado)'}`)
      console.log(`  hotmart_fee.total: ${item.purchase?.hotmart_fee?.total ?? '(não informado)'}`)
      console.log(`  price.value      : ${item.purchase?.price?.value ?? '(não informado)'} ${item.purchase?.price?.currency_value ?? ''}`)
      console.log(`  commissions      : ${JSON.stringify(item.commissions ?? [], null, 4).split('\n').join('\n  ')}`)
    }

    console.log()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
