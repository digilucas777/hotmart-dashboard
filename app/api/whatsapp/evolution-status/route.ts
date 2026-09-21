import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const baseUrl = String(body.baseUrl ?? '').replace(/\/$/, '')
    const apiKey = String(body.apiKey ?? '')
    const instanceName = String(body.instanceName ?? '')

    if (!baseUrl || !apiKey || !instanceName) {
      return NextResponse.json({ error: 'Informe URL, API key e nome da instância.' }, { status: 400 })
    }

    const response = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
      headers: { apikey: apiKey },
    })
    const json = await response.json().catch(() => ({}))

    if (!response.ok) {
      return NextResponse.json({ error: json?.message ?? 'Não foi possível checar o status.', details: json }, { status: response.status })
    }

    const state = json?.instance?.state ?? json?.state ?? null
    return NextResponse.json({ ok: true, state, connected: state === 'open' })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erro interno.' }, { status: 500 })
  }
}
