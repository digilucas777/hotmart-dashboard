import { createClient } from '@supabase/supabase-js'

const CLIENT_ID = process.env.HOTMART_CLIENT_ID
const CLIENT_SECRET = process.env.HOTMART_CLIENT_SECRET
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('HOTMART_CLIENT_ID e HOTMART_CLIENT_SECRET são obrigatórios.')
  process.exit(1)
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const BATCH_SIZE = 10
const DELAY_MS = 500

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
  return data.access_token
}

async function fetchTrackingSource(token: string, hotmartId: string): Promise<string | null> {
  const url = `https://developers.hotmart.com/payments/api/v1/sales/history?transaction=${hotmartId}`
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[${res.status}]: ${body}`)
  }

  const data = await res.json()
  const source = data?.items?.[0]?.purchase?.tracking?.source ?? null
  return source && source.trim() !== '' ? source.trim() : null
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function backfill() {
  console.log('Autenticando na Hotmart API...')
  const token = await getToken()
  console.log('Token obtido.\n')

  const { data: vendas, error } = await supabase
    .from('vendas')
    .select('id, hotmart_id')
    .is('origem', null)
    .not('hotmart_id', 'is', null)
    .eq('status', 'approved')
    .gte('data_venda', new Date(Date.now() - 30 * 86_400_000).toISOString())

  if (error) {
    console.error('Erro ao buscar vendas:', error.message)
    process.exit(1)
  }

  if (!vendas || vendas.length === 0) {
    console.log('Nenhuma venda com origem IS NULL, hotmart_id preenchido e status approved.')
    return
  }

  console.log(`${vendas.length} venda(s) para processar.\n`)

  let totalAtualizadas = 0
  let totalSemOrigem = 0
  let totalErros = 0

  for (let i = 0; i < vendas.length; i += BATCH_SIZE) {
    const lote = vendas.slice(i, i + BATCH_SIZE)
    console.log(`--- Lote ${Math.floor(i / BATCH_SIZE) + 1} (${i + 1}–${Math.min(i + BATCH_SIZE, vendas.length)} de ${vendas.length}) ---`)

    for (const venda of lote) {
      const hotmartId: string = venda.hotmart_id

      let source: string | null = null
      try {
        source = await fetchTrackingSource(token, hotmartId)
      } catch (err: any) {
        console.error(`[BACKFILL] HP: ${hotmartId} → erro ao buscar: ${err.message}`)
        totalErros++
        await sleep(DELAY_MS)
        continue
      }

      if (!source) {
        console.log(`[BACKFILL] HP: ${hotmartId} → sem origem`)
        totalSemOrigem++
        await sleep(DELAY_MS)
        continue
      }

      const { error: updateError } = await supabase
        .from('vendas')
        .update({ origem: source })
        .eq('id', venda.id)

      if (updateError) {
        console.error(`[BACKFILL] HP: ${hotmartId} → erro ao atualizar: ${updateError.message}`)
        totalErros++
      } else {
        console.log(`[BACKFILL] HP: ${hotmartId} → origem: ${source}`)
        totalAtualizadas++
      }

      await sleep(DELAY_MS)
    }
  }

  console.log('\n--- Resumo ---')
  console.log(`Total processadas : ${vendas.length}`)
  console.log(`Total atualizadas : ${totalAtualizadas}`)
  console.log(`Total sem origem  : ${totalSemOrigem}`)
  console.log(`Total com erro    : ${totalErros}`)
}

backfill().catch(err => {
  console.error('Erro fatal:', err.message)
  process.exit(1)
})
