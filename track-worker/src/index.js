import { sha256Hex } from './hash.js'
import { buildSnippet } from './snippet.js'
import { normalizePhone } from './phone.js'

const WORKER_VERSION = '1.2.0'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function parseEnvJson(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}

function handleSnippet(request, env) {
  const triggers = parseEnvJson(env.TRIGGERS_JSON, [])
  const checkoutDomains = parseEnvJson(env.CHECKOUT_DOMAINS_JSON, [])
  const sessionTtlDays = Number(env.SESSION_TTL_DAYS) || 7
  const workerOrigin = new URL(request.url).origin
  const body = buildSnippet({ sessionTtlDays, triggers, checkoutDomains, workerOrigin })
  return new Response(body, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  })
}

function isOriginAllowed(request, env) {
  const domains = parseEnvJson(env.DOMAINS_JSON, [])
  if (domains.length === 0) return true
  const origin = request.headers.get('Origin') || request.headers.get('Referer') || ''
  return domains.some(domain => origin.includes(domain))
}

// Cloudflare já entrega a geolocalização do visitante de graça em toda
// requisição (request.cf) — não precisa de serviço externo. Os campos
// ct/st/zp/country do advanced matching da Meta precisam vir hasheados
// (igual email/telefone), por isso essa função já devolve tudo pronto pra
// entrar no user_data.
async function buildGeoUserData(geo) {
  if (!geo) return {}
  const result = {}
  if (geo.city) result.ct = await sha256Hex(String(geo.city).replace(/[^a-zA-Z]/g, ''))
  if (geo.region) result.st = await sha256Hex(geo.region)
  if (geo.postalCode) result.zp = await sha256Hex(geo.postalCode)
  if (geo.country) result.country = await sha256Hex(geo.country)
  return result
}

function extractGeo(request) {
  const cf = request.cf || {}
  return {
    city: cf.city || null,
    region: cf.regionCode || cf.region || null,
    country: cf.country || null,
    postalCode: cf.postalCode || null,
  }
}

async function sendToMeta({ pixelId, capiToken, testEventCode, eventName, eventId, eventSourceUrl, userData, customData }) {
  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: eventSourceUrl,
      action_source: 'website',
      user_data: userData,
      custom_data: customData || {},
    }],
  }
  if (testEventCode) payload.test_event_code = testEventCode

  const res = await fetch(`https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${encodeURIComponent(capiToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`[Rastreamento] pixel ${pixelId} evento ${eventName} falhou: ${res.status} ${text}`)
  }
  return res.ok
}

// Manda um resumo do evento pro nosso dashboard (tela de diagnóstico/Etapa 4).
// Nunca usa a service role key — só o secret de ingestão dessa instalação,
// que só autoriza gravar eventos dela mesma. Roda em segundo plano via
// ctx.waitUntil (não atrasa a resposta) e nunca derruba o fluxo principal —
// se faltar INGEST_URL/INGEST_SECRET (deploy antigo) ou a chamada falhar, só
// loga quando o diagnóstico está ativo.
function sendToIngest(ctx, env, event) {
  if (!env.INGEST_URL || !env.INGEST_SECRET || !env.INSTALLATION_ID) return
  const task = fetch(env.INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ installation_id: env.INSTALLATION_ID, secret: env.INGEST_SECRET, ...event }),
  }).catch(err => {
    if (env.DIAGNOSTICO_ATIVO === 'true') {
      console.error('[Rastreamento] falha ao enviar pro ingest (não afeta o envio à Meta):', err)
    }
  })
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(task)
}

async function handleCollect(request, env, ctx) {
  if (!isOriginAllowed(request, env)) return json({ error: 'origin not allowed' }, 403)

  const body = await request.json().catch(() => null)
  if (!body || !body.event_name || !body.session_id) return json({ error: 'invalid payload' }, 400)

  const pixels = parseEnvJson(env.PIXELS_JSON, [])
  if (pixels.length === 0) return json({ error: 'no pixels configured' }, 500)

  const ip = request.headers.get('CF-Connecting-IP') || ''
  const userAgent = request.headers.get('User-Agent') || ''
  const geo = extractGeo(request)
  const eventId = `${body.session_id}:${body.event_name}:${Math.floor(Date.now() / 60000)}`

  const sessionEnrichment = env.SESSION_ENRICHMENT_ENABLED === 'true'
  if (sessionEnrichment && env.SESSIONS) {
    // Uma falha aqui (ex: cota de gravação do KV estourada) nunca pode impedir
    // o envio do evento principal pra Meta — por isso fica isolada num try/catch
    // próprio, só logada quando o diagnóstico está ativo.
    try {
      const ttlSeconds = (Number(env.SESSION_TTL_DAYS) || 7) * 86400
      const sessionData = { fbp: body.fbp || null, fbc: body.fbc || null, ip, userAgent, geo, url: body.url || null }

      // Grava a sessão (chave sid:) só na 1ª chamada da sessão inteira (marcada
      // pelo cliente via sessionStorage) — gravar em toda chamada estourava
      // rápido a cota gratuita de 1000 gravações/dia do KV.
      if (body.new_session) {
        await env.SESSIONS.put(`sid:${body.session_id}`, JSON.stringify(sessionData), { expirationTtl: ttlSeconds })
      }

      const email = body.params && body.params.email
      if (email) {
        const emailHash = await sha256Hex(email)
        await env.SESSIONS.put(`email:${emailHash}`, JSON.stringify(sessionData), { expirationTtl: ttlSeconds })
      }
    } catch (err) {
      if (env.DIAGNOSTICO_ATIVO === 'true') {
        console.error('[Rastreamento] falha ao gravar sessão no KV (evento seguiu normalmente):', err)
      }
    }
  }

  const userData = { client_ip_address: ip, client_user_agent: userAgent, ...(await buildGeoUserData(geo)) }
  if (body.fbp) userData.fbp = body.fbp
  if (body.fbc) userData.fbc = body.fbc

  const results = await Promise.all(pixels.map(pixel => sendToMeta({
    pixelId: pixel.pixel_id,
    capiToken: pixel.capi_token,
    testEventCode: pixel.test_event_code,
    eventName: body.event_name,
    eventId,
    eventSourceUrl: body.url,
    userData,
    customData: body.params || {},
  })))

  if (env.DIAGNOSTICO_ATIVO === 'true') {
    console.log('[Rastreamento] /collect', { event: body.event_name, session_id: body.session_id, resultados: results })
  }

  sendToIngest(ctx, env, {
    event_name: body.event_name,
    source: 'capi',
    fbp: body.fbp || null,
    fbc: body.fbc || null,
    ip,
    session_id: body.session_id,
    session_hit: false,
    raw_payload: env.DIAGNOSTICO_ATIVO === 'true' ? body : null,
  })

  return json({ ok: true })
}

async function handleHotmartWebhook(request, env, ctx) {
  const url = new URL(request.url)
  if (url.searchParams.get('secret') !== env.WEBHOOK_SECRET) return json({ error: 'unauthorized' }, 401)

  const body = await request.json().catch(() => null)
  if (!body || body.event !== 'PURCHASE_APPROVED') return json({ ok: true, ignored: true })

  const buyer = body.data?.buyer || {}
  const purchase = body.data?.purchase || {}
  const buyerCountry = buyer.address?.country || null

  const pixels = parseEnvJson(env.PIXELS_JSON, [])
  if (pixels.length === 0) return json({ error: 'no pixels configured' }, 500)

  const userData = {}
  if (buyer.email) userData.em = await sha256Hex(buyer.email)
  if (buyer.name) userData.fn = await sha256Hex(String(buyer.name).split(' ')[0])
  if (buyer.checkout_phone) {
    const normalizedPhone = normalizePhone(buyer.checkout_phone, buyerCountry)
    if (normalizedPhone) userData.ph = await sha256Hex(normalizedPhone)
  }
  if (buyer.document) userData.external_id = await sha256Hex(buyer.document)

  const sessionEnrichment = env.SESSION_ENRICHMENT_ENABLED === 'true'
  let sessionHit = false
  let matchedSessionId = null
  if (sessionEnrichment && env.SESSIONS) {
    // Uma falha aqui (ex: KV fora do ar) nunca pode impedir o envio do
    // Purchase — nesse caso ele só sai sem o bônus de fbp/fbc/geo.
    try {
      let session = null

      // Preferência 1: o "sck" que o script anexou no link de checkout —
      // cruza direto pelo session_id, funciona mesmo sem formulário de e-mail
      // antes do checkout.
      const origin = purchase?.origin
      const sck = origin && typeof origin === 'object' ? origin.sck : null
      if (sck) {
        const stored = await env.SESSIONS.get(`sid:${sck}`)
        if (stored) { session = JSON.parse(stored); matchedSessionId = sck }
      }

      // Preferência 2 (melhor esforço): se não achou pelo sck, tenta pelo
      // e-mail — só funciona se algum gatilho de formulário tiver capturado
      // o e-mail antes do checkout.
      if (!session && buyer.email) {
        const emailHash = await sha256Hex(buyer.email)
        const stored = await env.SESSIONS.get(`email:${emailHash}`)
        if (stored) session = JSON.parse(stored)
      }

      if (session) {
        sessionHit = true
        if (session.fbp) userData.fbp = session.fbp
        if (session.fbc) userData.fbc = session.fbc
        if (session.ip) userData.client_ip_address = session.ip
        if (session.userAgent) userData.client_user_agent = session.userAgent
        Object.assign(userData, await buildGeoUserData(session.geo))
      }
    } catch (err) {
      if (env.DIAGNOSTICO_ATIVO === 'true') {
        console.error('[Rastreamento] falha ao ler sessão do KV (Purchase seguiu sem o cruzamento):', err)
      }
    }
  }

  const eventId = `purchase:${purchase.transaction}`
  const results = await Promise.all(pixels.map(pixel => sendToMeta({
    pixelId: pixel.pixel_id,
    capiToken: pixel.capi_token,
    testEventCode: pixel.test_event_code,
    eventName: 'Purchase',
    eventId,
    eventSourceUrl: undefined,
    userData,
    customData: {
      value: purchase.price?.value ?? 0,
      currency: purchase.price?.currency_value ?? 'BRL',
    },
  })))

  if (env.DIAGNOSTICO_ATIVO === 'true') {
    console.log('[Rastreamento] /webhook/hotmart', { transaction: purchase.transaction, resultados: results })
  }

  sendToIngest(ctx, env, {
    event_name: 'Purchase',
    source: 'capi',
    fbp: userData.fbp || null,
    fbc: userData.fbc || null,
    ip: userData.client_ip_address || null,
    session_id: matchedSessionId,
    session_hit: sessionHit,
    raw_payload: env.DIAGNOSTICO_ATIVO === 'true' ? body : null,
  })

  return json({ ok: true })
}

function handleHealth(env) {
  const pixels = parseEnvJson(env.PIXELS_JSON, [])
  return json({ ok: true, version: WORKER_VERSION, pixels: pixels.length })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    try {
      if (url.pathname === '/t.js') return handleSnippet(request, env)
      if (url.pathname === '/collect' && request.method === 'POST') return handleCollect(request, env, ctx)
      if (url.pathname === '/webhook/hotmart') return handleHotmartWebhook(request, env, ctx)
      if (url.pathname === '/health') return handleHealth(env)
      return json({ error: 'not found' }, 404)
    } catch (err) {
      console.error('[Rastreamento] erro não tratado:', err)
      return json({ error: 'internal error' }, 500)
    }
  },
}
