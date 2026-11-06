import { NextResponse } from 'next/server'
import { clip, safeEqual } from '@/lib/security/secrets'
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
  event_id?: string | null
  capi_send_ok?: boolean | null
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

// Chamada pelo Worker (sem sessão de usuário, autenticação é pelo
// ingest_secret próprio de cada instalação, nunca a service role key). Best
// effort do ponto de vista de quem chama: se isso falhar, o Worker só loga,
// nunca deixa de responder ao navegador/Hotmart nem de mandar o evento à Meta.
export async function POST(request: Request) {
  const rawText = await request.text().catch(() => '')
  if (rawText.length > 64 * 1024) return NextResponse.json({ error: 'payload grande demais' }, { status: 413 })
  let body: IngestBody | null = null
  try { body = JSON.parse(rawText) as IngestBody } catch { body = null }
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

  if (!installation || !safeEqual(installation.ingest_secret, body.secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const row = {
    installation_id: body.installation_id,
    event_name: clip(body.event_name, 64),
    source: clip(body.source, 32),
    event_id: clip(body.event_id, 200),
    capi_send_ok: body.capi_send_ok ?? null,
    fbp: clip(body.fbp, 200),
    fbc: clip(body.fbc, 300),
    ip: clip(body.ip, 64),
    session_id: clip(body.session_id, 128),
    session_hit: !!body.session_hit,
    geo_city: clip(body.geo_city, 100),
    geo_region: clip(body.geo_region, 100),
    geo_country: clip(body.geo_country, 8),
    geo_postal_code: clip(body.geo_postal_code, 20),
    user_agent: clip(body.user_agent, 512),
    url: clip(body.url, 2048),
    utm_source: clip(body.utm_source, 300),
    utm_medium: clip(body.utm_medium, 300),
    utm_campaign: clip(body.utm_campaign, 300),
    utm_content: clip(body.utm_content, 300),
    utm_term: clip(body.utm_term, 300),
    src: clip(body.src, 300),
    raw_payload: body.raw_payload && JSON.stringify(body.raw_payload).length <= 8192 ? body.raw_payload : null,
  }

  // Dedup por installation_id+event_id: a Hotmart pode reenviar o mesmo
  // webhook de compra (ex: depois de um 5xx nosso), e sem isso cada reenvio
  // viraria uma 2ª linha de Purchase, inflando a contagem do próprio painel
  // mesmo a Meta já tendo deduplicado pelo mesmo event_id do lado dela.
  //
  // NÃO usar .upsert(..., { onConflict }) aqui: o índice único de
  // installation_id+event_id é PARCIAL (`where event_id is not null`, pra
  // não brigar com os eventos antigos sem event_id), Postgres rejeita
  // ON CONFLICT contra um índice parcial que o comando não referencia com a
  // mesma condição WHERE, e o upsert do Supabase não permite passar isso.
  // Isso já causou um bug real: todo insert com event_id (PageView/Purchase)
  // vinha falhando com "no unique or exclusion constraint matching", 500
  // silencioso (o Worker só loga isso com DIAGNOSTICO_ATIVO ligado), payload
  // sumia sem deixar rastro nenhum no painel. Insert simples + fallback pra
  // update só quando bate o unique (23505) evita esse problema de vez.
  const insertResult = await admin.from('track_events').insert(row)
  if (insertResult.error) {
    if (body.event_id && insertResult.error.code === '23505') {
      const { error: updateError } = await admin
        .from('track_events')
        .update(row)
        .eq('installation_id', body.installation_id)
        .eq('event_id', body.event_id)
      if (updateError) { console.error('[ingest] update', updateError.message); return NextResponse.json({ error: 'erro ao gravar' }, { status: 500 }) }
    } else {
      console.error('[ingest] insert', insertResult.error.message)
      return NextResponse.json({ error: 'erro ao gravar' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
