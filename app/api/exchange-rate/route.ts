export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=BRL', {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error('upstream error')
    const data = (await res.json()) as { rates: { BRL: number } }
    return Response.json({ rate: data.rates.BRL })
  } catch {
    return Response.json({ rate: 5.85 })
  }
}
