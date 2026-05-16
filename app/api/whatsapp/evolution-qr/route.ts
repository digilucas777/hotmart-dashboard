import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const baseUrl = String(body.baseUrl ?? process.env.EVOLUTION_API_URL ?? '').replace(/\/$/, '')
    const apiKey = String(body.apiKey ?? process.env.EVOLUTION_API_KEY ?? '')
    const instanceName = String(body.instanceName ?? '')
    const number = String(body.number ?? '').replace(/\D/g, '')

    if (!baseUrl || !apiKey || !instanceName) {
      return NextResponse.json(
        { error: 'Informe URL da Evolution API, API key e nome da instância.' },
        { status: 400 },
      )
    }

    await fetch(`${baseUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        ...(number ? { number } : {}),
      }),
    }).catch(() => null)

    const connectUrl = new URL(`${baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`)
    if (number) connectUrl.searchParams.set('number', number)

    const response = await fetch(connectUrl, {
      headers: { apikey: apiKey },
    })
    const json = await response.json().catch(() => ({}))

    if (!response.ok) {
      return NextResponse.json(
        { error: json?.message ?? 'Não foi possível gerar o QR Code.', details: json },
        { status: response.status },
      )
    }

    return NextResponse.json({
      ok: true,
      base64: json?.base64 ?? json?.qrcode?.base64 ?? null,
      code: json?.code ?? json?.qrcode?.code ?? null,
      pairingCode: json?.pairingCode ?? json?.qrcode?.pairingCode ?? null,
      raw: json,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      { status: 500 },
    )
  }
}
