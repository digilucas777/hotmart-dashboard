const CLIENT_ID = process.env.HOTMART_CLIENT_ID
const CLIENT_SECRET = process.env.HOTMART_CLIENT_SECRET

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('HOTMART_CLIENT_ID e HOTMART_CLIENT_SECRET são obrigatórios.')
  process.exit(1)
}

const TEST_TRANSACTION = 'HP1676602497'

async function getToken(): Promise<string> {
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')

  const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Auth falhou [${res.status}]: ${body}`)
  }

  const data = await res.json()
  console.log('Token obtido:', {
    token_type: data.token_type,
    expires_in: data.expires_in,
    scope: data.scope,
  })

  return data.access_token
}

async function fetchTransaction(token: string, transaction: string) {
  const url = `https://developers.hotmart.com/payments/api/v1/sales/history?transaction=${transaction}`

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Busca de transação falhou [${res.status}]: ${body}`)
  }

  return res.json()
}

async function main() {
  console.log(`\n=== Teste API Hotmart ===`)
  console.log(`Transação de teste: ${TEST_TRANSACTION}\n`)

  const token = await getToken()

  console.log('\nBuscando transação...')
  const data = await fetchTransaction(token, TEST_TRANSACTION)

  console.log('\n=== Resposta completa ===')
  console.log(JSON.stringify(data, null, 2))

  const items: any[] = data?.items ?? []
  if (items.length > 0) {
    const sale = items[0]
    console.log('\n=== Campos relevantes (primeiro item) ===')
    console.log('transaction:', sale?.purchase?.transaction)
    console.log('origin:', sale?.purchase?.origin)
    console.log('source:', sale?.purchase?.source)
    console.log('tracking_source:', sale?.purchase?.tracking?.source_sck)
    console.log('offer_code:', sale?.purchase?.offer?.code)
    console.log('product_name:', sale?.product?.name)
    console.log('buyer_name:', sale?.buyer?.name)
    console.log('status:', sale?.purchase?.status)
  }
}

main().catch(err => {
  console.error('\nErro:', err.message)
  process.exit(1)
})
