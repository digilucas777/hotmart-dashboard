import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type IngestBody = {
  installation_id?: string
  secret?: string
  event_name?: string
  source?: 'pixel' | 'capi'
  fbp?: string | null
  fbc?: string | null
  ip?: string | null
  session_id?: string | null
  session_hit?: boolean
  geo_city?: string | null
  geo_region?: string | null
  geo_country?: string | null
  geo_postal_code?: string | null
  user_agent?: string | null
  url?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  utm_term?: string | null
  src?: string | null
  raw_payload?: unknown
}

// Chamada pelo Worker (sem sessão de usuário — autenticação é pelo
// ingest_secret próprio de cada instalação, nunca a service role key). Best
// effort do ponto de vista de quem chama: se isso falhar, o Worker só loga,
// nunca deixa de responder ao navegador/Hotmart nem de mandar o evento à Meta.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as IngestBody | null
  if (!body?.installation_id || !body?.secret || !body?.event_name || !body?.source) {
    return NextResponse.json({ error: 'payload inválido' }, { status: 400 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'service key not configured' }, { status: 500 })

  const { data: installation } = await admin
    .from('track_installations')
    .select('id, ingest_secret')
    .eq('id', body.installation_id)
    .maybeSingle()

  if (!installation || installation.ingest_secret !== body.secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { error } = await admin.from('track_events').insert({
    installation_id: body.installation_id,
    event_name: body.event_name,
    source: body.source,
    fbp: body.fbp ?? null,
    fbc: body.fbc ?? null,
    ip: body.ip ?? null,
    session_id: body.session_id ?? null,
    session_hit: !!body.session_hit,
    geo_city: body.geo_city ?? null,
    geo_region: body.geo_region ?? null,
    geo_country: body.geo_country ?? null,
    geo_postal_code: body.geo_postal_code ?? null,
    user_agent: body.user_agent ?? null,
    url: body.url ?? null,
    utm_source: body.utm_source ?? null,
    utm_medium: body.utm_medium ?? null,
    utm_campaign: body.utm_campaign ?? null,
    utm_content: body.utm_content ?? null,
    utm_term: body.utm_term ?? null,
    src: body.src ?? null,
    raw_payload: body.raw_payload ?? null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
