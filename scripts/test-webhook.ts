const WEBHOOK_URL = 'https://hotmart-dashboard-woad.vercel.app/api/webhook/hotmart'

const payload = {
  event: 'PURCHASE_APPROVED',
  data: {
    product: {
      id: '0000000',
      name: 'Produto Teste',
    },
    purchase: {
      transaction: 'HP2957429941C1',
      order_date: Date.now(),
      price: {
        value: 297,
        currency_value: 'BRL',
      },
      payment: {
        type: 'CREDIT_CARD',
        card_type: 'VISA',
      },
      offer: {
        code: 'oferta_teste',
        name: 'Oferta Teste',
      },
      tracking_parameters: {
        utm_source: null,
      },
      origin: null,
    },
    buyer: {
      name: 'Comprador Teste',
      email: 'comprador@teste.com',
      address: {
        country: 'BR',
      },
    },
    commissions: [
      { source: 'MARKETPLACE', currency_value: 'BRL', value: 29.7 },
      { source: 'PRODUCER', currency_value: 'BRL', value: 267.3 },
    ],
    affiliates: [],
  },
}

async function main() {
  console.log('POST', WEBHOOK_URL)
  console.log('transaction:', payload.data.purchase.transaction)
  console.log()

  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }

  console.log('status:', res.status, res.statusText)
  console.log('resposta:', JSON.stringify(body, null, 2))
}

main().catch(err => {
  console.error('Erro:', err)
  process.exit(1)
})
