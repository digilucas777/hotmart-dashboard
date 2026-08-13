import { sha256Hex } from './hash.js'
import { buildSnippet } from './snippet.js'
import { normalizePhone } from './phone.js'

const WORKER_VERSION = '1.2.0'

function json(data, status = 200, extraHeaders) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...extraHeaders } })
}

function parseEnvJson(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}

// O /collect é chamado via fetch com Content-Type application/json pra outro
// domínio — pro navegador isso conta como requisição "não-simples" e ele
// manda um preflight OPTIONS antes. Sem responder esse preflight com os
// cabeçalhos certos, o navegador cancela o POST de verdade silenciosamente
// (sem erro nenhum no console) — foi exatamente isso que impedia os eventos
// de chegar, mesmo depois da URL do COLLECT_URL já estar correta.
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || ''
  return {
    'Access-Control-Allow-Origin': isOriginAllowed(request, env) ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function handleSnippet(request, env) {
  const triggers = parseEnvJson(env.TRIGGERS_JSON, [])
  const checkoutDomains = parseEnvJson(env.CHECKOUT_DOMAINS_JSON, [])
  const sessionTtlDays = Number(env.SESSION_TTL_DAYS) || 7
  const workerOrigin = new URL(request.url).origin
  const pixelIds = parseEnvJson(env.PIXEL_IDS_JSON, [])
  const body = buildSnippet({ sessionTtlDays, triggers, checkoutDomains, workerOrigin, pixelIds })
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Até 3 tentativas — mas só quando faz sentido tentar de novo. Erro 4xx (token
// revogado, payload rejeitado) vai falhar do mesmo jeito numa 2ª tentativa, então
// desiste na hora; só erro de rede ou 5xx (instabilidade passageira da própria
// Meta) justifica insistir. Isso existe porque uma venda que falha aqui e a
// gente só loga (sem re-tentar) é uma venda perdida pra sempre do lado da Meta,
// sem nenhum aviso — o dado real de compra na Hotmart não muda, só o que
// manda/não manda pra Meta.
async function sendToMeta({ pixelId, capiToken, testEventCode, eventName, eventId, eventTime, eventSourceUrl, userData, customData }) {
  const payload = {
    data: [{
      event_name: eventName,
      event_time: eventTime || Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: eventSourceUrl,
      action_source: 'website',
      user_data: userData,
      custom_data: customData || {},
    }],
  }
  if (testEventCode) payload.test_event_code = testEventCode

  const url = `https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${encodeURIComponent(capiToken)}`
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) return true
      const text = await res.text()
      const isRetryable = res.status >= 500
      if (!isRetryable || attempt === maxAttempts) {
        console.error(`[Rastreamento] pixel ${pixelId} evento ${eventName} falhou (tentativa ${attempt}/${maxAttempts}): ${res.status} ${text}`)
        return false
      }
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error(`[Rastreamento] pixel ${pixelId} evento ${eventName} falhou de rede (tentativa ${attempt}/${maxAttempts}):`, err)
        return false
      }
    }
    await sleep(200 * attempt)
  }
  return false
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
  const cors = corsHeaders(request, env)
  if (!isOriginAllowed(request, env)) return json({ error: 'origin not allowed' }, 403, cors)

  const body = await request.json().catch(() => null)
  if (!body || !body.event_name || !body.session_id) return json({ error: 'invalid payload' }, 400, cors)

  const pixels = parseEnvJson(env.PIXELS_JSON, [])
  if (pixels.length === 0) return json({ error: 'no pixels configured' }, 500, cors)

  const ip = request.headers.get('CF-Connecting-IP') || ''
  const userAgent = request.headers.get('User-Agent') || ''
  const geo = extractGeo(request)
  // Pro PageView, o script já manda um event_id gerado no navegador — é o
  // mesmo ID que ele usa pra disparar o pixel nativo da Meta (fbq), fazendo
  // a Meta fundir os dois em 1 evento só em vez de contar em dobro. Só cai
  // no ID gerado aqui quando o cliente não mandou nenhum.
  const eventId = body.event_id || `${body.session_id}:${body.event_name}:${Math.floor(Date.now() / 60000)}`

  const sessionEnrichment = env.SESSION_ENRICHMENT_ENABLED === 'true'
  if (sessionEnrichment && env.SESSIONS) {
    // Uma falha aqui (ex: cota de gravação do KV estourada) nunca pode impedir
    // o envio do evento principal pra Meta — por isso fica isolada num try/catch
    // próprio, só logada quando o diagnóstico está ativo.
    try {
      const ttlSeconds = (Number(env.SESSION_TTL_DAYS) || 7) * 86400
      const sessionData = { fbp: body.fbp || null, fbc: body.fbc || null, ip, userAgent, geo, url: body.url || null, utm: body.utm || null, src: body.src || null }

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

  // O gatilho form_submit já captura email/telefone/nome na hora do envio —
  // antes isso só ia pro custom_data (a Meta não usa esse campo pra casar
  // identidade). Hasheando aqui e colocando no user_data (mesmos campos que
  // o webhook de Purchase já usa: em/fn/ln/ph/external_id), o evento de Lead
  // ganha o mesmo nível de correspondência avançada, sem depender de cruzar
  // sessão depois. Remove do custom_data pra não mandar o dado cru 2x.
  const customData = { ...(body.params || {}) }
  if (customData.email) {
    userData.em = await sha256Hex(customData.email)
    userData.external_id = userData.em
    delete customData.email
  }
  if (customData.nome) {
    const [firstName, ...rest] = String(customData.nome).trim().split(/\s+/)
    if (firstName) userData.fn = await sha256Hex(firstName)
    if (rest.length) userData.ln = await sha256Hex(rest.join(' '))
    delete customData.nome
  }
  if (customData.phone) {
    const normalizedPhone = normalizePhone(customData.phone, geo.country)
    if (normalizedPhone) userData.ph = await sha256Hex(normalizedPhone)
    delete customData.phone
  }

  const results = await Promise.all(pixels.map(pixel => sendToMeta({
    pixelId: pixel.pixel_id,
    capiToken: pixel.capi_token,
    testEventCode: pixel.test_event_code,
    eventName: body.event_name,
    eventId,
    eventSourceUrl: body.url,
    userData,
    customData,
  })))
  const capiSendOk = results.length > 0 && results.every(Boolean)

  if (env.DIAGNOSTICO_ATIVO === 'true') {
    console.log('[Rastreamento] /collect', { event: body.event_name, session_id: body.session_id, resultados: results })
  }

  const utm = body.utm || {}
  sendToIngest(ctx, env, {
    event_name: body.event_name,
    source: 'capi',
    event_id: eventId,
    capi_send_ok: capiSendOk,
    fbp: body.fbp || null,
    fbc: body.fbc || null,
    ip,
    session_id: body.session_id,
    session_hit: false,
    geo_city: geo.city,
    geo_region: geo.region,
    geo_country: geo.country,
    geo_postal_code: geo.postalCode,
    user_agent: userAgent,
    url: body.url || null,
    utm_source: utm.utm_source || null,
    utm_medium: utm.utm_medium || null,
    utm_campaign: utm.utm_campaign || null,
    utm_content: utm.utm_content || null,
    utm_term: utm.utm_term || null,
    src: body.src || null,
    raw_payload: env.DIAGNOSTICO_ATIVO === 'true' ? body : null,
  })

  return json({ ok: true }, 200, cors)
}

// Rota só de MONITORAMENTO — nunca chama sendToMeta, só avisa o nosso
// próprio painel (source: 'pixel'). Usada pelo clique em link de checkout,
// pra dar uma ideia aproximada de quantos InitiateCheckout deveriam estar
// acontecendo, comparável com o que a Hotmart já manda direto pra Meta pelo
// pixel nativo dela — sem nenhum risco de duplicar o envio à Meta, porque
// essa rota literalmente não tem código nenhum que fale com a Meta.
async function handleMonitor(request, env, ctx) {
  const cors = corsHeaders(request, env)
  if (!isOriginAllowed(request, env)) return json({ error: 'origin not allowed' }, 403, cors)

  const body = await request.json().catch(() => null)
  if (!body || !body.event_name || !body.session_id) return json({ error: 'invalid payload' }, 400, cors)

  const ip = request.headers.get('CF-Connecting-IP') || ''
  const geo = extractGeo(request)

  sendToIngest(ctx, env, {
    event_name: body.event_name,
    source: 'pixel',
    ip,
    session_id: body.session_id,
    session_hit: false,
    geo_city: geo.city,
    geo_region: geo.region,
    geo_country: geo.country,
    geo_postal_code: geo.postalCode,
    url: body.url || null,
  })

  return json({ ok: true }, 200, cors)
}

async function handleHotmartWebhook(request, env, ctx) {
  const url = new URL(request.url)
  if (url.searchParams.get('secret') !== env.WEBHOOK_SECRET) return json({ error: 'unauthorized' }, 401)

  const body = await request.json().catch(() => null)
  if (!body || body.event !== 'PURCHASE_APPROVED') return json({ ok: true, ignored: true })

  const buyer = body.data?.buyer || {}
  const purchase = body.data?.purchase || {}
  const product = body.data?.product || {}
  // O mapa de DDI (normalizePhone) usa sigla ISO ("FR"), mas
  // buyer.address.country vem por extenso ("France") — tem que ser o
  // country_iso, senão a busca do DDI nunca bate e o telefone sai sem
  // prefixo pra ninguém.
  const buyerCountry = buyer.address?.country_iso || null

  const pixels = parseEnvJson(env.PIXELS_JSON, [])
  if (pixels.length === 0) return json({ error: 'no pixels configured' }, 500)

  // O webhook da Hotmart é por PRODUTO, não por domínio/pixel/campanha — se
  // o mesmo produto também é vendido por outro pixel/campanha fora desse
  // funil, a Hotmart chama esse mesmo webhook pra QUALQUER venda aprovada
  // do produto. Quando REQUIRE_TRACKER_SRC está ligado, só manda pra Meta
  // as vendas cujo "src" tem o sufixo "-tracker" que o nosso próprio script
  // colou no link de checkout — o resto ainda aparece no painel (fica
  // registrado), só não vai pra Meta, pra não atribuir errado.
  const requireTrackerSrc = env.REQUIRE_TRACKER_SRC === 'true'
  const rawSrc = purchase?.origin?.src || null
  const isTrackedSale = !requireTrackerSrc || (typeof rawSrc === 'string' && rawSrc.toLowerCase().includes('tracker'))

  const userData = {}
  if (buyer.email) userData.em = await sha256Hex(buyer.email)
  // Hotmart já manda o nome separado (first_name/last_name) — usar isso é
  // mais confiável que quebrar buyer.name no primeiro espaço, e a Meta
  // recomenda mandar sobrenome (ln) também, não só o primeiro nome.
  const firstName = buyer.first_name || String(buyer.name || '').split(' ')[0]
  if (firstName) userData.fn = await sha256Hex(firstName)
  if (buyer.last_name) userData.ln = await sha256Hex(buyer.last_name)
  if (buyer.checkout_phone) {
    const normalizedPhone = normalizePhone(buyer.checkout_phone, buyerCountry)
    if (normalizedPhone) userData.ph = await sha256Hex(normalizedPhone)
  }
  // external_id devia ser um identificador estável do cliente — o CPF
  // (buyer.document) só existe pra comprador brasileiro; pra o resto do
  // mundo (a maioria do público francês/internacional) vem vazio. Nesse
  // caso, usa o e-mail com hash como external_id também (a Meta permite
  // repetir o mesmo identificador em campos diferentes) em vez de deixar
  // o campo inteiro de fora.
  if (buyer.document) userData.external_id = await sha256Hex(buyer.document)
  else if (buyer.email) userData.external_id = await sha256Hex(buyer.email)

  const sessionEnrichment = env.SESSION_ENRICHMENT_ENABLED === 'true'
  let sessionHit = false
  let matchedSessionId = null
  let matchedSession = null
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
        matchedSession = session
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

  // Endereço de cobrança da própria Hotmart, quando vem preenchido, é mais
  // preciso que geo por IP (que é só uma estimativa de localização, não o
  // endereço real) — sobrescreve só os campos que vierem preenchidos aqui,
  // sem mexer no que já veio da sessão (a Hotmart não expõe "estado" no
  // endereço do comprador, então "st" continua vindo só da sessão/IP).
  const billingAddress = buyer.address || {}
  Object.assign(userData, await buildGeoUserData({
    city: billingAddress.city || null,
    postalCode: billingAddress.zipcode || null,
    country: billingAddress.country_iso || null,
  }))

  // event_time o mais próximo possível do momento real da aprovação (a
  // Hotmart manda em milissegundos) — melhor do que "agora", que é só a
  // hora em que o webhook chegou aqui (pode ter atraso de entrega).
  const eventTime = purchase.approved_date ? Math.floor(purchase.approved_date / 1000) : undefined

  const eventId = `purchase:${purchase.transaction}`
  let results = []
  let capiSendOk = null
  if (isTrackedSale) {
    results = await Promise.all(pixels.map(pixel => sendToMeta({
      pixelId: pixel.pixel_id,
      capiToken: pixel.capi_token,
      testEventCode: pixel.test_event_code,
      eventName: 'Purchase',
      eventId,
      eventTime,
      // A Hotmart não manda a URL de onde a compra saiu, mas a sessão
      // cruzada (via sck) sabe qual página o comprador visitou por último.
      eventSourceUrl: matchedSession?.url,
      userData,
      customData: {
        value: purchase.price?.value ?? 0,
        currency: purchase.price?.currency_value ?? 'BRL',
        content_ids: product.id != null ? [String(product.id)] : undefined,
        content_name: product.name || undefined,
        content_type: 'product',
      },
    })))
    capiSendOk = results.length > 0 && results.every(Boolean)
  }

  if (env.DIAGNOSTICO_ATIVO === 'true') {
    if (isTrackedSale) {
      console.log('[Rastreamento] /webhook/hotmart', { transaction: purchase.transaction, resultados: results })
    } else {
      console.log('[Rastreamento] /webhook/hotmart ignorado (src sem "-tracker", não é desse funil):', { transaction: purchase.transaction, src: rawSrc })
    }
  }

  const matchedGeo = matchedSession?.geo || {}
  const matchedUtm = matchedSession?.utm || {}
  sendToIngest(ctx, env, {
    event_name: 'Purchase',
    source: isTrackedSale ? 'capi' : 'pixel',
    event_id: eventId,
    capi_send_ok: capiSendOk,
    fbp: userData.fbp || null,
    fbc: userData.fbc || null,
    ip: userData.client_ip_address || null,
    session_id: matchedSessionId,
    session_hit: sessionHit,
    geo_city: matchedGeo.city || null,
    geo_region: matchedGeo.region || null,
    geo_country: matchedGeo.country || null,
    geo_postal_code: matchedGeo.postalCode || null,
    user_agent: matchedSession?.userAgent || null,
    url: matchedSession?.url || null,
    utm_source: matchedUtm.utm_source || null,
    utm_medium: matchedUtm.utm_medium || null,
    utm_campaign: matchedUtm.utm_campaign || null,
    utm_content: matchedUtm.utm_content || null,
    utm_term: matchedUtm.utm_term || null,
    // Preferência 1: o "src" que a própria Hotmart manda no payload da compra
    // (mesma fonte que já alimenta vendas.origem) — mais confiável que o da
    // sessão, que depende do visitante ter passado pela página com o
    // parâmetro. Preferência 2: o que a sessão de navegação capturou.
    src: purchase?.origin?.src || matchedSession?.src || null,
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
      if (url.pathname === '/collect' && request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request, env) })
      }
      if (url.pathname === '/collect' && request.method === 'POST') return handleCollect(request, env, ctx)
      if (url.pathname === '/monitor' && request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request, env) })
      }
      if (url.pathname === '/monitor' && request.method === 'POST') return handleMonitor(request, env, ctx)
      if (url.pathname === '/webhook/hotmart') return handleHotmartWebhook(request, env, ctx)
      if (url.pathname === '/health') return handleHealth(env)
      return json({ error: 'not found' }, 404)
    } catch (err) {
      console.error('[Rastreamento] erro não tratado:', err)
      return json({ error: 'internal error' }, 500)
    }
  },
}
