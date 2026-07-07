export const dynamic = 'force-dynamic'

const FALLBACK_RATE = 5.85

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
      const res = await fetch(`https://api.frankfurter.app/${from}..${clampedTo}?from=USD&to=BRL`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error('upstream error')
      const data = (await res.json()) as { rates: Record<string, { BRL: number }> }
      const values = Object.values(data.rates ?? {}).map(r => r.BRL).filter(v => typeof v === 'number')
      if (values.length === 0) throw new Error('sem cotacoes no periodo')
      const media = values.reduce((s, v) => s + v, 0) / values.length
      return Response.json({ rate: media })
    }

    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=BRL', {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error('upstream error')
    const data = (await res.json()) as { rates: { BRL: number } }
    return Response.json({ rate: data.rates.BRL })
  } catch {
    return Response.json({ rate: FALLBACK_RATE })
  }
}
