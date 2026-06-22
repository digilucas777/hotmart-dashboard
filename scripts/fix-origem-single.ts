import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const cid = process.env.HOTMART_CLIENT_ID
  const cs = process.env.HOTMART_CLIENT_SECRET
  const creds = Buffer.from(`${cid}:${cs}`).toString('base64')
  const auth = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  })
  const { access_token } = await auth.json()
  const t0 = Date.now()
  const res = await fetch('https://developers.hotmart.com/payments/api/v1/sales/history?transaction=HP0562064843', {
    headers: { 'Authorization': `Bearer ${access_token}` }
  })
  const data = await res.json()
  const origem = data?.items?.[0]?.purchase?.tracking?.source
  console.log('origem:', origem, `(${Date.now() - t0}ms)`)
  if (origem) {
    const { error } = await supabase.from('vendas').update({ origem }).eq('hotmart_id', 'HP0562064843')
    console.log('atualizado:', !error, error)
  }
}

main()
