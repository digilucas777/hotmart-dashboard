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

const DELAY_MS = 300

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

interface OfertaInfo {
  oferta_codigo: string | null
  oferta_nome: string | null
  oferta_preco: number | null
  oferta_moeda: string | null
  origem: string | null
}

async function fetchOfertaInfo(token: string, hotmartId: string): Promise<OfertaInfo> {
  const url = `https://developers.hotmart.com/payments/api/v1/sales/history?transaction=${hotmartId}`
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[${res.status}]: ${body}`)
  }

  const data = await res.json()
  const purchase = data?.items?.[0]?.purchase ?? null

  return {
    oferta_codigo: purchase?.offer?.code ?? null,
    oferta_nome: purchase?.offer?.name ?? null,
    oferta_preco: purchase?.price?.value ?? null,
    oferta_moeda: purchase?.price?.currency_code ?? null,
    origem: purchase?.tracking?.source ?? null,
  }
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
    .select('id, hotmart_id, origem')
    .is('oferta_codigo', null)
    .eq('status', 'approved')
    .not('hotmart_id', 'is', null)

  if (error) {
    console.error('Erro ao buscar vendas:', error.message)
    process.exit(1)
  }

  if (!vendas || vendas.length === 0) {
    console.log('Nenhuma venda com oferta_codigo IS NULL, status approved e hotmart_id preenchido.')
    return
  }

  console.log(`${vendas.length} venda(s) para processar.\n`)

  let totalAtualizadas = 0
  let totalSemOferta = 0
  let totalErros = 0

  for (const venda of vendas) {
    const hotmartId: string = venda.hotmart_id

    let info: OfertaInfo
    try {
      info = await fetchOfertaInfo(token, hotmartId)
    } catch (err: any) {
      console.error(`[BACKFILL] HP: ${hotmartId} → erro ao buscar: ${err.message}`)
      totalErros++
      await sleep(DELAY_MS)
      continue
    }

    if (!info.oferta_codigo) {
      console.log(`[BACKFILL] HP: ${hotmartId} → sem oferta`)
      totalSemOferta++
      await sleep(DELAY_MS)
      continue
    }

    const updates: Record<string, any> = {
      oferta_codigo: info.oferta_codigo,
    }
    if (info.oferta_nome !== null) updates.oferta_nome = info.oferta_nome
    if (info.oferta_preco !== null) updates.oferta_preco = info.oferta_preco
    if (info.oferta_moeda !== null) updates.oferta_moeda = info.oferta_moeda
    if (info.origem !== null && venda.origem === null) updates.origem = info.origem

    const { error: updateError } = await supabase
      .from('vendas')
      .update(updates)
      .eq('id', venda.id)

    if (updateError) {
      console.error(`[BACKFILL] HP: ${hotmartId} → erro ao atualizar: ${updateError.message}`)
      totalErros++
    } else {
      console.log(`[BACKFILL] HP: ${hotmartId} → oferta: ${info.oferta_codigo} | ${info.oferta_nome ?? '(sem nome)'} | ${info.oferta_preco} ${info.oferta_moeda}`)
      totalAtualizadas++
    }

    await sleep(DELAY_MS)
  }

  console.log('\n--- Resumo ---')
  console.log(`Total processadas : ${vendas.length}`)
  console.log(`Total atualizadas : ${totalAtualizadas}`)
  console.log(`Total sem oferta  : ${totalSemOferta}`)
  console.log(`Total com erro    : ${totalErros}`)
}

backfill().catch(err => {
  console.error('Erro fatal:', err.message)
  process.exit(1)
})
