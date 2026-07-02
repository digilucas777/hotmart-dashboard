import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const ACCOUNTS = [
  { label: 'conta 1', id: process.env.HOTMART_CLIENT_ID!, secret: process.env.HOTMART_CLIENT_SECRET! },
  { label: 'conta 2', id: process.env.HOTMART_CLIENT_ID_2!, secret: process.env.HOTMART_CLIENT_SECRET_2! },
]

async function getToken(id: string, secret: string): Promise<string> {
  const res = await fetch('https://api-sec-vlc.hotmart.com/security/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`Auth falhou ${res.status}`)
  const { access_token } = await res.json()
  return access_token
}

async function fetchItem(token: string, txId: string): Promise<any | null> {
  const res = await fetch(
    `https://developers.hotmart.com/payments/api/v1/sales/history?transaction=${encodeURIComponent(txId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return null
  const data = await res.json()
  return data?.items?.[0] ?? null
}

function fmt(item: any): string {
  if (!item) return '→ não encontrado'
  const p = item.purchase
  const lines = [
    `price        : ${p?.price?.value} ${p?.price?.currency_value}`,
    `fee.total    : ${p?.hotmart_fee?.total ?? '(null)'}`,
    `fee.base     : ${p?.hotmart_fee?.base ?? '(null)'}`,
    `commissions  : ${JSON.stringify(item.commissions ?? [])}`,
  ]
  return lines.join('\n    ')
}

async function main() {
  // Busca as 23 transações do banco
  const { data: vendas } = await sb
    .from('vendas')
    .select('hotmart_id, valor, valor_recebido')
    .gt('valor', 1000)
    .order('valor', { ascending: false })

  if (!vendas?.length) { console.log('Nenhuma venda > 1000 encontrada.'); return }

  console.log(`${vendas.length} transações com valor > 1000\n`)

  // Autentica
  const tokens: string[] = []
  for (const acc of ACCOUNTS) {
    try { tokens.push(await getToken(acc.id, acc.secret)); console.log(`Token ${acc.label} OK`) }
    catch (e: any) { tokens.push(''); console.error(`Token ${acc.label} FALHOU: ${e.message}`) }
  }
  console.log()

  for (const venda of vendas) {
    const id = venda.hotmart_id
    console.log(`${'─'.repeat(60)}`)
    console.log(`${id}  |  banco: valor=${venda.valor}  valor_recebido=${venda.valor_recebido}`)

    for (let i = 0; i < ACCOUNTS.length; i++) {
      const token = tokens[i]
      process.stdout.write(`  [${ACCOUNTS[i].label}] `)
      if (!token) { console.log('sem token'); continue }
      try {
        const item = await fetchItem(token, id)
        console.log('\n    ' + fmt(item))
      } catch (e: any) {
        console.log(`erro: ${e.message}`)
      }
    }
    console.log()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
