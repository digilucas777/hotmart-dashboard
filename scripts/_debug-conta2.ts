import { createClient } from '@supabase/supabase-js'

const CLIENT_ID_2 = process.env.HOTMART_CLIENT_ID_2!
const CLIENT_SECRET_2 = process.env.HOTMART_CLIENT_SECRET_2!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function getToken() {
  const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID_2}:${CLIENT_SECRET_2}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json()
  return data.access_token as string
}

async function main() {
  // Pega uma venda com has_co_production=true
  const { data: vendas } = await supabase
    .from('vendas')
    .select('hotmart_id, hotmart_payload')
    .not('hotmart_payload', 'is', null)
    .limit(1000)

  const comCoprod = (vendas ?? []).filter(v => {
    const p = v.hotmart_payload as any
    return p?.data?.product?.has_co_production === true
  })

  const amostra = comCoprod.slice(0, 3).map(v => v.hotmart_id)
  console.log('Transações com coprodução:', amostra)

  const token = await getToken()
  console.log('Token conta2 OK\n')

  for (const id of amostra) {
    const res = await fetch(
      `https://developers.hotmart.com/payments/api/v1/sales/history?transaction=${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    const item = data?.items?.[0]

    console.log(`=== ${id} ===`)
    console.log('Status HTTP:', res.status)
    console.log('items count:', data?.items?.length ?? 0)
    if (item) {
      console.log('item keys:', Object.keys(item))
      console.log('item completo:', JSON.stringify(item, null, 2))
    } else {
      console.log('→ NÃO ENCONTRADO na conta 2')
      console.log('Raw:', JSON.stringify(data, null, 2).slice(0, 500))
    }
    console.log()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
