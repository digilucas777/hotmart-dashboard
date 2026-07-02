/**
 * Diagnóstico: mostra estrutura do hotmart_payload para encontrar has_co_production
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function findKey(obj: any, key: string, path = ''): string[] {
  if (!obj || typeof obj !== 'object') return []
  const results: string[] = []
  for (const k of Object.keys(obj)) {
    const fullPath = path ? `${path}.${k}` : k
    if (k.toLowerCase().includes(key.toLowerCase())) {
      results.push(`${fullPath} = ${JSON.stringify(obj[k])}`)
    }
    results.push(...findKey(obj[k], key, fullPath))
  }
  return results
}

async function main() {
  // 1. Pega uma amostra de 3 payloads com commissions
  const { data: vendas } = await supabase
    .from('vendas')
    .select('hotmart_id, hotmart_payload')
    .not('hotmart_payload', 'is', null)
    .limit(3)

  for (const v of vendas ?? []) {
    console.log(`\n=== ${v.hotmart_id} ===`)
    const payload = v.hotmart_payload as any

    console.log('Raiz do payload:', Object.keys(payload ?? {}))
    console.log('payload.data keys:', Object.keys(payload?.data ?? {}))
    console.log('payload.data.purchase keys:', Object.keys(payload?.data?.purchase ?? {}))

    const found = findKey(payload, 'co_production')
    console.log('Busca "co_production" no JSON:', found.length ? found : 'NÃO ENCONTRADO')

    const foundCo = findKey(payload, 'coprod')
    if (foundCo.length) console.log('Busca "coprod":', foundCo)
  }

  // 2. Procura payload que TEM co_production em algum lugar
  console.log('\n=== Buscando payload com "co_production" no banco ===')
  // Usando raw Postgres via RPC não disponível direto, então busca 50 e filtra
  const { data: sample } = await supabase
    .from('vendas')
    .select('hotmart_id, hotmart_payload')
    .not('hotmart_payload', 'is', null)
    .limit(500)
    .range(0, 499)

  const comCoprod = (sample ?? []).filter(v => {
    const s = JSON.stringify(v.hotmart_payload)
    return s.includes('co_production') || s.includes('coprod')
  })

  console.log(`Em 500 registros: ${comCoprod.length} com "co_production" ou "coprod" no JSON`)
  if (comCoprod.length > 0) {
    const exemplo = comCoprod[0]
    const found = findKey(exemplo.hotmart_payload, 'co_production')
    const foundCo = findKey(exemplo.hotmart_payload, 'coprod')
    console.log(`Exemplo (${exemplo.hotmart_id}):`, [...found, ...foundCo])
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
