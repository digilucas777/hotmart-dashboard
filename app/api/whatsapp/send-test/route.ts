import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const connectionId = String(body.connectionId ?? '')
    const recipients: string[] = Array.isArray(body.recipients) ? body.recipients.map(String) : [String(body.to ?? '')]
    const message = String(body.message ?? '')

    if (!message.trim() || recipients.length === 0 || recipients.every(r => !r.trim())) {
      return NextResponse.json({ error: 'Mensagem e destinatário são obrigatórios.' }, { status: 400 })
    }

    const { data: connection } = connectionId
      ? await supabase.from('whatsapp_connections').select('*').eq('id', connectionId).single()
      : { data: null }

    if (connection?.provider === 'evolution') {
      const baseUrl = String(connection.evolution_url ?? process.env.EVOLUTION_API_URL ?? '').replace(/\/$/, '')
      const apiKey = String(connection.evolution_api_key ?? process.env.EVOLUTION_API_KEY ?? '')
      const instance = String(connection.evolution_instance ?? '')

      if (!baseUrl || !apiKey || !instance) {
        return NextResponse.json(
          { error: 'Conexão Evolution incompleta. Gere o QR Code novamente com URL, API key e instância.' },
          { status: 400 },
        )
      }

      const results = await Promise.all(
        recipients
          .map(r => r.replace(/\D/g, ''))
          .filter(Boolean)
          .map(async number => {
            const res = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: apiKey,
              },
              body: JSON.stringify({ number, text: message }),
            })
            const json = await res.json().catch(() => ({}))
            return { to: number, ok: res.ok, response: json }
          }),
      )

      const failed = results.find(r => !r.ok)
      if (failed) return NextResponse.json({ error: 'Falha ao enviar pela Evolution API.', results }, { status: 502 })
      return NextResponse.json({ ok: true, results })
    }

    const phoneNumberId =
      connection?.phone_number_id ??
      process.env.WHATSAPP_PHONE_NUMBER_ID
    const accessToken =
      connection?.access_token ??
      process.env.WHATSAPP_ACCESS_TOKEN
    const apiVersion =
      connection?.api_version ??
      process.env.WHATSAPP_API_VERSION ??
      'v25.0'

    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        { error: 'Configure WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN ou salve esses dados na conexão.' },
        { status: 400 },
      )
    }

    const results = await Promise.all(
      recipients
        .map(r => r.replace(/\D/g, ''))
        .filter(Boolean)
        .map(async to => {
          const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              recipient_type: 'individual',
              to,
              type: 'text',
              text: { preview_url: false, body: message },
            }),
          })
          const json = await res.json()
          return { to, ok: res.ok, response: json }
        }),
    )

    const failed = results.find(r => !r.ok)
    if (failed) return NextResponse.json({ error: 'Falha ao enviar WhatsApp.', results }, { status: 502 })
    return NextResponse.json({ ok: true, results })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      { status: 500 },
    )
  }
}
