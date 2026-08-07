export const dynamic = 'force-dynamic'

// Só usado se TODAS as tentativas contra o Frankfurter falharem — um valor
// fixo antigo aqui pode ficar bem longe da cotação real (foi exatamente o
// que causou faturamento/comissão divergentes num mesmo período: uma busca
// pegou a cotação real (~5,12) e outra caiu nesse fallback (5,85), mesmos
// dados de venda, números finais bem diferentes). Retry reduz drasticamente
// a chance de cair aqui; mesmo assim, é só uma rede de segurança, não uma
// cotação confiável — nunca deveria ser o valor "normal".
const FALLBACK_RATE = 5.0

async function fetchFrankfurter(url: string): Promise<{ rates: Record<string, { BRL: number }> | { BRL: number } }> {
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (res.ok) return await res.json()
    } catch {
      // tentativa falhou (timeout/rede) — tenta de novo, exceto na última
    }
    if (attempt < maxAttempts) await new Promise(resolve => setTimeout(resolve, 300 * attempt))
  }
  throw new Error('Frankfurter indisponível após tentativas')
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  try {
    if (from && to) {
      // Cotacao media do periodo filtrado, nao a de hoje -- evita distorcer a conversao
      // de vendas antigas em USD com uma taxa de cambio que pode ja ter mudado bastante.
      const today = new Date().toISOString().slice(0, 10)
      const clampedTo = to > today ? today : to
      const data = await fetchFrankfurter(`https://api.frankfurter.app/${from}..${clampedTo}?from=USD&to=BRL`) as { rates: Record<string, { BRL: number }> }
      const values = Object.values(data.rates ?? {}).map(r => r.BRL).filter(v => typeof v === 'number')
      if (values.length === 0) throw new Error('sem cotacoes no periodo')
      const media = values.reduce((s, v) => s + v, 0) / values.length
      return Response.json({ rate: media })
    }

    const data = await fetchFrankfurter('https://api.frankfurter.app/latest?from=USD&to=BRL') as { rates: { BRL: number } }
    return Response.json({ rate: data.rates.BRL })
  } catch {
    return Response.json({ rate: FALLBACK_RATE, fallback: true })
  }
}
