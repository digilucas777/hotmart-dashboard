import { sha256Hex } from './hash.js'
import { buildSnippet } from './snippet.js'

const WORKER_VERSION = '1.0.0'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function parseEnvJson(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}

function handleSnippet(env) {
  const triggers = parseEnvJson(env.TRIGGERS_JSON, [])
  const sessionTtlDays = Number(env.SESSION_TTL_DAYS) || 7
  const body = buildSnippet({ sessionTtlDays, triggers })
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

async function handleCollect(request, env) {
  if (!isOriginAllowed(request, env)) return json({ error: 'origin not allowed' }, 403)

  const body = await request.json().catch(() => null)
  if (!body || !body.event_name || !body.session_id) return json({ error: 'invalid payload' }, 400)

  const pixels = parseEnvJson(env.PIXELS_JSON, [])
  if (pixels.length === 0) return json({ error: 'no pixels configured' }, 500)

  const ip = request.headers.get('CF-Connecting-IP') || ''
  const userAgent = request.headers.get('User-Agent') || ''
  const eventId = `${body.session_id}:${body.event_name}:${Math.floor(Date.now() / 60000)}`

  const sessionEnrichment = env.SESSION_ENRICHMENT_ENABLED === 'true'
  if (sessionEnrichment && env.SESSIONS) {
    // Uma falha aqui (ex: cota de gravação do KV estourada) nunca pode impedir
    // o envio do evento principal pra Meta — por isso fica isolada num try/catch
    // próprio, só logada quando o diagnóstico está ativo.
    try {
      const ttlSeconds = (Number(env.SESSION_TTL_DAYS) || 7) * 86400
      const sessionData = { fbp: body.fbp || null, fbc: body.fbc || null, ip, userAgent, url: body.url || null }
      await env.SESSIONS.put(`sid:${body.session_id}`, JSON.stringify(sessionData), { expirationTtl: ttlSeconds })

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

  const userData = { client_ip_address: ip, client_user_agent: userAgent }
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

  return json({ ok: true })
}

async function handleHotmartWebhook(request, env) {
  const url = new URL(request.url)
  if (url.searchParams.get('secret') !== env.WEBHOOK_SECRET) return json({ error: 'unauthorized' }, 401)

  const body = await request.json().catch(() => null)
  if (!body || body.event !== 'PURCHASE_APPROVED') return json({ ok: true, ignored: true })

  const buyer = body.data?.buyer || {}
  const purchase = body.data?.purchase || {}

  const pixels = parseEnvJson(env.PIXELS_JSON, [])
  if (pixels.length === 0) return json({ error: 'no pixels configured' }, 500)

  const userData = {}
  if (buyer.email) userData.em = await sha256Hex(buyer.email)
  if (buyer.name) userData.fn = await sha256Hex(String(buyer.name).split(' ')[0])
  if (buyer.checkout_phone) userData.ph = await sha256Hex(String(buyer.checkout_phone).replace(/\D/g, ''))
  if (buyer.document) userData.external_id = await sha256Hex(buyer.document)

  const sessionEnrichment = env.SESSION_ENRICHMENT_ENABLED === 'true'
  if (sessionEnrichment && env.SESSIONS && buyer.email) {
    // Mesma proteção do /collect: uma falha ao ler o KV não pode impedir o
    // envio do Purchase — nesse caso ele só sai sem o bônus de fbp/fbc.
    try {
      const emailHash = await sha256Hex(buyer.email)
      const stored = await env.SESSIONS.get(`email:${emailHash}`)
      if (stored) {
        const session = JSON.parse(stored)
        if (session.fbp) userData.fbp = session.fbp
        if (session.fbc) userData.fbc = session.fbc
        if (session.ip) userData.client_ip_address = session.ip
        if (session.userAgent) userData.client_user_agent = session.userAgent
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

  return json({ ok: true })
}

function handleHealth(env) {
  const pixels = parseEnvJson(env.PIXELS_JSON, [])
  return json({ ok: true, version: WORKER_VERSION, pixels: pixels.length })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    try {
      if (url.pathname === '/t.js') return handleSnippet(env)
      if (url.pathname === '/collect' && request.method === 'POST') return handleCollect(request, env)
      if (url.pathname === '/webhook/hotmart') return handleHotmartWebhook(request, env)
      if (url.pathname === '/health') return handleHealth(env)
      return json({ error: 'not found' }, 404)
    } catch (err) {
      console.error('[Rastreamento] erro não tratado:', err)
      return json({ error: 'internal error' }, 500)
    }
  },
}
