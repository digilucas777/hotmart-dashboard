import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from './index.js'
import { sha256Hex } from './hash.js'

function makeKvMock() {
  const store = new Map()
  return {
    async get(key) { return store.has(key) ? store.get(key) : null },
    async put(key, value) { store.set(key, value) },
    _store: store,
  }
}

function makeFailingKvMock() {
  return {
    async get() { throw new Error('KV get falhou (simulado)') },
    async put() { throw new Error('KV put falhou (simulado, ex: cota excedida)') },
  }
}

function makeEnv(overrides = {}) {
  return {
    PIXELS_JSON: JSON.stringify([{ pixel_id: '111', capi_token: 'tok', test_event_code: null }]),
    WEBHOOK_SECRET: 'segredo123',
    DOMAINS_JSON: JSON.stringify(['minhalp.com.br']),
    TRIGGERS_JSON: JSON.stringify([]),
    SESSION_ENRICHMENT_ENABLED: 'true',
    SESSION_TTL_DAYS: '7',
    DIAGNOSTICO_ATIVO: 'false',
    SESSIONS: makeKvMock(),
    ...overrides,
  }
}

function makeEnvWithIngest(overrides = {}) {
  return makeEnv({
    INGEST_URL: 'https://dashboard.teste.com/api/track/events/ingest',
    INGEST_SECRET: 'ingest-secret-123',
    INSTALLATION_ID: 'inst-1',
    ...overrides,
  })
}

function makeCtx() {
  const tasks = []
  return { waitUntil: task => tasks.push(task), _tasks: tasks }
}

test('GET /t.js retorna javascript com PageView automático', async () => {
  const env = makeEnv()
  const res = await worker.fetch(new Request('https://sinal.teste.com/t.js'), env)
  const body = await res.text()
  assert.equal(res.headers.get('Content-Type'), 'application/javascript; charset=utf-8')
  assert.match(body, /send\('PageView'\)/)
})

test('GET /t.js usa o próprio domínio do Worker como COLLECT_URL (script roda no domínio da página do cliente)', async () => {
  const env = makeEnv()
  const res = await worker.fetch(new Request('https://sinal.teste.com/t.js'), env)
  const body = await res.text()
  assert.match(body, /COLLECT_URL = "https:\/\/sinal\.teste\.com" \+ '\/collect'/)
})

test('GET /health retorna a contagem de pixels configurados', async () => {
  const env = makeEnv()
  const res = await worker.fetch(new Request('https://sinal.teste.com/health'), env)
  const json = await res.json()
  assert.equal(json.ok, true)
  assert.equal(json.pixels, 1)
})

test('OPTIONS /collect responde o preflight de CORS (senão o navegador cancela o sendBeacon real, sem erro nenhum)', async () => {
  const env = makeEnv()
  const req = new Request('https://sinal.teste.com/collect', {
    method: 'OPTIONS',
    headers: { Origin: 'https://minhalp.com.br', 'Access-Control-Request-Method': 'POST' },
  })
  const res = await worker.fetch(req, env)
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://minhalp.com.br')
  assert.match(res.headers.get('Access-Control-Allow-Methods'), /POST/)
})

test('POST /collect responde com Access-Control-Allow-Origin da origem permitida', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  try {
    const env = makeEnv()
    const req = new Request('https://sinal.teste.com/collect', {
      method: 'POST',
      headers: { Origin: 'https://minhalp.com.br', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_name: 'PageView', session_id: 'abc' }),
    })
    const res = await worker.fetch(req, env)
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://minhalp.com.br')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST /collect rejeita origem fora da allowlist', async () => {
  const env = makeEnv()
  const req = new Request('https://sinal.teste.com/collect', {
    method: 'POST',
    headers: { Origin: 'https://site-pirata.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_name: 'PageView', session_id: 'abc' }),
  })
  const res = await worker.fetch(req, env)
  assert.equal(res.status, 403)
})

test('POST /monitor avisa o dashboard (source: pixel) e NUNCA chama a Meta', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (reqUrl, init) => {
    calls.push({ url: String(reqUrl), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnvWithIngest()
    const ctx = makeCtx()
    const req = new Request('https://sinal.teste.com/monitor', {
      method: 'POST',
      headers: { Origin: 'https://minhalp.com.br', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_name: 'InitiateCheckout', session_id: 'sess-ic', url: 'https://minhalp.com.br/checkout-click' }),
    })
    const res = await worker.fetch(req, env, ctx)
    assert.equal(res.status, 200)
    await Promise.all(ctx._tasks)

    assert.equal(calls.length, 1, 'só devia ter UMA chamada de fetch (o ingest) — nenhuma pra graph.facebook.com')
    assert.doesNotMatch(calls[0].url, /graph\.facebook\.com/)
    const ingestBody = JSON.parse(calls[0].init.body)
    assert.equal(ingestBody.event_name, 'InitiateCheckout')
    assert.equal(ingestBody.source, 'pixel')
    assert.equal(ingestBody.session_id, 'sess-ic')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('OPTIONS /monitor responde o preflight de CORS', async () => {
  const env = makeEnv()
  const req = new Request('https://sinal.teste.com/monitor', {
    method: 'OPTIONS',
    headers: { Origin: 'https://minhalp.com.br', 'Access-Control-Request-Method': 'POST' },
  })
  const res = await worker.fetch(req, env)
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://minhalp.com.br')
})

test('POST /monitor rejeita origem fora da allowlist', async () => {
  const env = makeEnv()
  const req = new Request('https://sinal.teste.com/monitor', {
    method: 'POST',
    headers: { Origin: 'https://site-pirata.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_name: 'InitiateCheckout', session_id: 'abc' }),
  })
  const res = await worker.fetch(req, env)
  assert.equal(res.status, 403)
})

test('POST /collect aceita origem permitida e envia pro Meta', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({}), { status: 200 })
  }
  try {
    const env = makeEnv()
    const req = new Request('https://sinal.teste.com/collect', {
      method: 'POST',
      headers: { Origin: 'https://minhalp.com.br', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_name: 'PageView', session_id: 'abc123', fbp: 'fb.1.111', url: 'https://minhalp.com.br/' }),
    })
    const res = await worker.fetch(req, env)
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
    assert.match(calls[0].url, /graph\.facebook\.com\/v20\.0\/111\/events/)
    const sentBody = JSON.parse(calls[0].init.body)
    assert.equal(sentBody.data[0].event_name, 'PageView')
    assert.equal(sentBody.data[0].user_data.fbp, 'fb.1.111')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST /collect salva sessão e e-mail no KV quando enriquecimento está ligado e new_session é true', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  try {
    const env = makeEnv()
    const req = new Request('https://sinal.teste.com/collect', {
      method: 'POST',
      headers: { Origin: 'https://minhalp.com.br', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_name: 'Lead', session_id: 'sess1', url: 'https://minhalp.com.br/', new_session: true, params: { email: 'joao@exemplo.com' } }),
    })
    await worker.fetch(req, env)
    assert.ok(env.SESSIONS._store.has('sid:sess1'))
    const emailKeys = [...env.SESSIONS._store.keys()].filter(k => k.startsWith('email:'))
    assert.equal(emailKeys.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST /collect NÃO grava a sessão de novo se new_session não vier true (economiza a cota do KV)', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  try {
    const env = makeEnv()
    const req = new Request('https://sinal.teste.com/collect', {
      method: 'POST',
      headers: { Origin: 'https://minhalp.com.br', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_name: 'ViewContent', session_id: 'sess1', url: 'https://minhalp.com.br/produto' }),
    })
    await worker.fetch(req, env)
    assert.equal(env.SESSIONS._store.has('sid:sess1'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST /collect inclui geo (hasheado) no evento, a partir de request.cf', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnv()
    const req = new Request('https://sinal.teste.com/collect', {
      method: 'POST',
      headers: { Origin: 'https://minhalp.com.br', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_name: 'PageView', session_id: 'sess-geo', url: 'https://minhalp.com.br/' }),
    })
    req.cf = { city: 'São Paulo', regionCode: 'SP', country: 'BR', postalCode: '01310-100' }
    await worker.fetch(req, env)
    const sentBody = JSON.parse(calls[0].init.body)
    const userData = sentBody.data[0].user_data
    assert.equal(userData.ct.length, 64)
    assert.equal(userData.st.length, 64)
    assert.equal(userData.zp.length, 64)
    assert.equal(userData.country.length, 64)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart rejeita secret errado', async () => {
  const env = makeEnv()
  const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=errado', {
    method: 'POST',
    body: JSON.stringify({ event: 'PURCHASE_APPROVED', data: {} }),
  })
  const res = await worker.fetch(req, env)
  assert.equal(res.status, 401)
})

test('webhook da Hotmart aprovado hasheia dados do comprador e cruza sessão salva por e-mail', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnv()
    const emailHash = await sha256Hex('joao@exemplo.com')
    await env.SESSIONS.put('email:' + emailHash, JSON.stringify({ fbp: 'fb.1.222', fbc: null, ip: '1.2.3.4', userAgent: 'ua-teste' }))

    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: { buyer: { name: 'João Silva', email: 'joao@exemplo.com' }, purchase: { transaction: 'HP123', price: { value: 97, currency_value: 'BRL' } } },
      }),
    })
    const res = await worker.fetch(req, env)
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
    const sentBody = JSON.parse(calls[0].init.body)
    const userData = sentBody.data[0].user_data
    assert.equal(userData.em.length, 64)
    assert.equal(userData.fbp, 'fb.1.222')
    assert.equal(sentBody.data[0].event_name, 'Purchase')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart prioriza o cruzamento pelo sck (link de checkout) sobre o e-mail', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnv()
    // Sessão salva pelo sid (via decorador do link de checkout) tem um fbp
    // diferente da sessão salva por e-mail — o teste confirma que o sck vence.
    await env.SESSIONS.put('sid:sess-abc', JSON.stringify({ fbp: 'fb.1.333', fbc: null, ip: '9.9.9.9', userAgent: 'ua-sck', geo: { city: 'Paris', country: 'FR' } }))
    const emailHash = await sha256Hex('joao@exemplo.com')
    await env.SESSIONS.put('email:' + emailHash, JSON.stringify({ fbp: 'fb.1.222', fbc: null, ip: '1.2.3.4', userAgent: 'ua-email' }))

    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: {
          buyer: { name: 'João Silva', email: 'joao@exemplo.com' },
          purchase: { transaction: 'HP124', price: { value: 97, currency_value: 'BRL' }, origin: { sck: 'sess-abc' } },
        },
      }),
    })
    await worker.fetch(req, env)
    const sentBody = JSON.parse(calls[0].init.body)
    const userData = sentBody.data[0].user_data
    assert.equal(userData.fbp, 'fb.1.333')
    assert.equal(userData.ct.length, 64)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart normaliza o telefone com o DDI do país do comprador antes de hashear', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnv()
    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: {
          buyer: { name: 'Marie Curie', checkout_phone: '06 12 34 56 78', address: { country: 'FR' } },
          purchase: { transaction: 'HP125', price: { value: 47, currency_value: 'EUR' } },
        },
      }),
    })
    await worker.fetch(req, env)
    const sentBody = JSON.parse(calls[0].init.body)
    const expectedHash = await sha256Hex('33612345678')
    assert.equal(sentBody.data[0].user_data.ph, expectedHash)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST /collect ainda envia o evento pra Meta mesmo se a gravação no KV falhar', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnv({ SESSIONS: makeFailingKvMock() })
    const req = new Request('https://sinal.teste.com/collect', {
      method: 'POST',
      headers: { Origin: 'https://minhalp.com.br', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_name: 'PageView', session_id: 'abc123', url: 'https://minhalp.com.br/', params: { email: 'joao@exemplo.com' } }),
    })
    const res = await worker.fetch(req, env)
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart ainda envia o Purchase mesmo se a leitura do KV falhar', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnv({ SESSIONS: makeFailingKvMock() })
    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: { buyer: { name: 'João Silva', email: 'joao@exemplo.com' }, purchase: { transaction: 'HP123', price: { value: 97, currency_value: 'BRL' } } },
      }),
    })
    const res = await worker.fetch(req, env)
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
    const sentBody = JSON.parse(calls[0].init.body)
    assert.equal(sentBody.data[0].event_name, 'Purchase')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST /collect avisa o dashboard (ingest) em segundo plano, sem atrasar a resposta', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnvWithIngest()
    const ctx = makeCtx()
    const req = new Request('https://sinal.teste.com/collect', {
      method: 'POST',
      headers: { Origin: 'https://minhalp.com.br', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_name: 'PageView', session_id: 'sess-ingest', url: 'https://minhalp.com.br/' }),
    })
    const res = await worker.fetch(req, env, ctx)
    assert.equal(res.status, 200)
    await Promise.all(ctx._tasks)

    const ingestCall = calls.find(c => c.url === env.INGEST_URL)
    assert.ok(ingestCall, 'esperava uma chamada pro INGEST_URL')
    const ingestBody = JSON.parse(ingestCall.init.body)
    assert.equal(ingestBody.installation_id, 'inst-1')
    assert.equal(ingestBody.secret, 'ingest-secret-123')
    assert.equal(ingestBody.event_name, 'PageView')
    assert.equal(ingestBody.source, 'capi')
    assert.equal(ingestBody.session_id, 'sess-ingest')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST /collect manda geo cru e UTM pro ingest (painel precisa mostrar de onde veio o visitante)', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnvWithIngest()
    const ctx = makeCtx()
    const req = new Request('https://sinal.teste.com/collect', {
      method: 'POST',
      headers: { Origin: 'https://minhalp.com.br', 'Content-Type': 'application/json', 'cf-connecting-ip': '9.9.9.9' },
      body: JSON.stringify({
        event_name: 'PageView',
        session_id: 'sess-utm',
        url: 'https://minhalp.com.br/?utm_source=facebook&utm_medium=cpc&utm_campaign=verao',
        utm: { utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'verao' },
      }),
    })
    req.cf = { city: 'Paris', regionCode: 'IDF', country: 'FR', postalCode: '75001' }
    await worker.fetch(req, env, ctx)
    await Promise.all(ctx._tasks)

    const ingestCall = calls.find(c => c.url === env.INGEST_URL)
    const ingestBody = JSON.parse(ingestCall.init.body)
    assert.equal(ingestBody.geo_city, 'Paris')
    assert.equal(ingestBody.geo_country, 'FR')
    assert.equal(ingestBody.utm_source, 'facebook')
    assert.equal(ingestBody.utm_medium, 'cpc')
    assert.equal(ingestBody.utm_campaign, 'verao')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart avisa o dashboard (ingest) com session_hit true quando cruzou sessão', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnvWithIngest()
    const ctx = makeCtx()
    await env.SESSIONS.put('sid:sess-xyz', JSON.stringify({ fbp: 'fb.1.999', fbc: null, ip: '8.8.8.8', userAgent: 'ua', geo: null }))

    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: {
          buyer: { name: 'Ana Souza', email: 'ana@exemplo.com' },
          purchase: { transaction: 'HP999', price: { value: 197, currency_value: 'BRL' }, origin: { sck: 'sess-xyz' } },
        },
      }),
    })
    const res = await worker.fetch(req, env, ctx)
    assert.equal(res.status, 200)
    await Promise.all(ctx._tasks)

    const ingestCall = calls.find(c => c.url === env.INGEST_URL)
    assert.ok(ingestCall, 'esperava uma chamada pro INGEST_URL')
    const ingestBody = JSON.parse(ingestCall.init.body)
    assert.equal(ingestBody.event_name, 'Purchase')
    assert.equal(ingestBody.session_hit, true)
    assert.equal(ingestBody.session_id, 'sess-xyz')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart propaga geo e UTM da sessão cruzada pro ingest do Purchase', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnvWithIngest()
    const ctx = makeCtx()
    await env.SESSIONS.put('sid:sess-utm2', JSON.stringify({
      fbp: 'fb.1.999', fbc: null, ip: '8.8.8.8', userAgent: 'ua',
      geo: { city: 'Lyon', region: 'ARA', country: 'FR', postalCode: '69001' },
      url: 'https://minhalp.com.br/?utm_source=facebook',
      utm: { utm_source: 'facebook', utm_medium: 'cpc' },
    }))

    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: {
          buyer: { name: 'Ana Souza', email: 'ana@exemplo.com' },
          purchase: { transaction: 'HP998', price: { value: 197, currency_value: 'BRL' }, origin: { sck: 'sess-utm2' } },
        },
      }),
    })
    await worker.fetch(req, env, ctx)
    await Promise.all(ctx._tasks)

    const ingestCall = calls.find(c => c.url === env.INGEST_URL)
    const ingestBody = JSON.parse(ingestCall.init.body)
    assert.equal(ingestBody.geo_city, 'Lyon')
    assert.equal(ingestBody.geo_country, 'FR')
    assert.equal(ingestBody.utm_source, 'facebook')
    assert.equal(ingestBody.utm_medium, 'cpc')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart NÃO manda pra Meta quando REQUIRE_TRACKER_SRC está ligado e o src não tem "-tracker" (venda de outro pixel/campanha)', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnvWithIngest({ REQUIRE_TRACKER_SRC: 'true' })
    const ctx = makeCtx()
    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: {
          buyer: { name: 'Outro Comprador', email: 'outro@exemplo.com' },
          purchase: { transaction: 'HP-OUTRO-PIXEL', price: { value: 97, currency_value: 'BRL' }, origin: { src: 'outro-pixel-campanha' } },
        },
      }),
    })
    const res = await worker.fetch(req, env, ctx)
    assert.equal(res.status, 200)
    await Promise.all(ctx._tasks)

    assert.equal(calls.filter(c => c.url.includes('graph.facebook.com')).length, 0, 'não devia mandar pra Meta')
    const ingestCall = calls.find(c => c.url === env.INGEST_URL)
    assert.ok(ingestCall, 'ainda devia aparecer no nosso painel')
    const ingestBody = JSON.parse(ingestCall.init.body)
    assert.equal(ingestBody.source, 'pixel')
    assert.equal(ingestBody.src, 'outro-pixel-campanha')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart MANDA pra Meta quando REQUIRE_TRACKER_SRC está ligado e o src tem "-tracker"', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnvWithIngest({ REQUIRE_TRACKER_SRC: 'true' })
    const ctx = makeCtx()
    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: {
          buyer: { name: 'Comprador Rastreado', email: 'rastreado@exemplo.com' },
          purchase: { transaction: 'HP-RASTREADO', price: { value: 97, currency_value: 'BRL' }, origin: { src: 'pv-b-vs-nv-tracker' } },
        },
      }),
    })
    const res = await worker.fetch(req, env, ctx)
    assert.equal(res.status, 200)
    await Promise.all(ctx._tasks)

    assert.equal(calls.filter(c => c.url.includes('graph.facebook.com')).length, 1, 'devia mandar pra Meta')
    const ingestCall = calls.find(c => c.url === env.INGEST_URL)
    const ingestBody = JSON.parse(ingestCall.init.body)
    assert.equal(ingestBody.source, 'capi')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart manda pra Meta normalmente quando REQUIRE_TRACKER_SRC não está ligado (comportamento padrão, compatível)', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnvWithIngest()
    const ctx = makeCtx()
    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: {
          buyer: { name: 'Sem Filtro', email: 'semfiltro@exemplo.com' },
          purchase: { transaction: 'HP-SEM-FILTRO', price: { value: 97, currency_value: 'BRL' } },
        },
      }),
    })
    const res = await worker.fetch(req, env, ctx)
    assert.equal(res.status, 200)
    await Promise.all(ctx._tasks)
    assert.equal(calls.filter(c => c.url.includes('graph.facebook.com')).length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})
