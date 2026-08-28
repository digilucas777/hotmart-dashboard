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

test('POST /collect hasheia email/telefone/nome capturados por formulário e coloca no user_data (em/fn/ln/ph/external_id), em vez de só custom_data', async () => {
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
      body: JSON.stringify({
        event_name: 'Lead',
        session_id: 'sess-lead',
        url: 'https://minhalp.com.br/',
        params: { email: 'joao@exemplo.com', phone: '06 12 34 56 78', nome: 'João Silva' },
      }),
    })
    req.cf = { country: 'FR' }
    await worker.fetch(req, env)
    const sentBody = JSON.parse(calls[0].init.body)
    const userData = sentBody.data[0].user_data
    const customData = sentBody.data[0].custom_data
    assert.equal(userData.em, await sha256Hex('joao@exemplo.com'))
    assert.equal(userData.external_id, userData.em)
    assert.equal(userData.fn, await sha256Hex('João'))
    assert.equal(userData.ln, await sha256Hex('Silva'))
    assert.equal(userData.ph, await sha256Hex('33612345678'))
    assert.equal(customData.email, undefined, 'email não devia sobrar no custom_data depois de ir pro user_data')
    assert.equal(customData.phone, undefined)
    assert.equal(customData.nome, undefined)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST /collect mantém outros campos de params (não relacionados a identidade) no custom_data normalmente', async () => {
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
      body: JSON.stringify({
        event_name: 'VideoProgress',
        session_id: 'sess-video',
        url: 'https://minhalp.com.br/',
        params: { percentual: 75 },
      }),
    })
    await worker.fetch(req, env)
    const sentBody = JSON.parse(calls[0].init.body)
    assert.equal(sentBody.data[0].custom_data.percentual, 75)
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
          buyer: { name: 'Marie Curie', checkout_phone: '06 12 34 56 78', address: { country: 'France', country_iso: 'FR' } },
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

test('webhook da Hotmart manda sobrenome (ln) e prefere first_name/last_name da Hotmart em vez de quebrar buyer.name', async () => {
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
          buyer: { name: 'Xavier Bénéat', first_name: 'Xavier', last_name: 'Bénéat', email: 'xavier@exemplo.com' },
          purchase: { transaction: 'HP200', price: { value: 39.98, currency_value: 'EUR' } },
        },
      }),
    })
    await worker.fetch(req, env)
    const userData = JSON.parse(calls[0].init.body).data[0].user_data
    assert.equal(userData.fn, await sha256Hex('Xavier'))
    assert.equal(userData.ln, await sha256Hex('Bénéat'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart usa e-mail com hash como external_id quando não tem CPF (comprador não-brasileiro)', async () => {
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
          buyer: { name: 'Xavier Bénéat', email: 'xavier@exemplo.com', document: '' },
          purchase: { transaction: 'HP201', price: { value: 39.98, currency_value: 'EUR' } },
        },
      }),
    })
    await worker.fetch(req, env)
    const userData = JSON.parse(calls[0].init.body).data[0].user_data
    assert.equal(userData.external_id, await sha256Hex('xavier@exemplo.com'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart usa purchase.approved_date como event_time (mais preciso que "agora")', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnv()
    const approvedDateMs = 1784912744000
    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: {
          buyer: { name: 'Teste', email: 'teste@exemplo.com' },
          purchase: { transaction: 'HP202', price: { value: 39.98, currency_value: 'EUR' }, approved_date: approvedDateMs },
        },
      }),
    })
    await worker.fetch(req, env)
    const sentBody = JSON.parse(calls[0].init.body)
    assert.equal(sentBody.data[0].event_time, Math.floor(approvedDateMs / 1000))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart manda event_source_url da sessão cruzada (a Hotmart não manda isso sozinha)', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnv()
    await env.SESSIONS.put('sid:sess-url', JSON.stringify({ fbp: 'fb.1.1', fbc: null, ip: '1.1.1.1', userAgent: 'ua', url: 'https://minhalp.com.br/pr/' }))
    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: {
          buyer: { name: 'Teste', email: 'teste@exemplo.com' },
          purchase: { transaction: 'HP203', price: { value: 39.98, currency_value: 'EUR' }, origin: { sck: 'sess-url' } },
        },
      }),
    })
    await worker.fetch(req, env)
    const sentBody = JSON.parse(calls[0].init.body)
    assert.equal(sentBody.data[0].event_source_url, 'https://minhalp.com.br/pr/')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart usa endereço de cobrança da Hotmart (mais preciso que geo por IP) quando vier preenchido', async () => {
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
          buyer: { name: 'Teste', email: 'teste@exemplo.com', address: { city: 'Lyon', zipcode: '69001', country_iso: 'FR' } },
          purchase: { transaction: 'HP204', price: { value: 39.98, currency_value: 'EUR' } },
        },
      }),
    })
    await worker.fetch(req, env)
    const userData = JSON.parse(calls[0].init.body).data[0].user_data
    assert.equal(userData.ct, await sha256Hex('Lyon'))
    assert.equal(userData.zp, await sha256Hex('69001'))
    assert.equal(userData.country, await sha256Hex('FR'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart manda content_ids/content_name/content_type do produto no Purchase', async () => {
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
          buyer: { name: 'Teste', email: 'teste@exemplo.com' },
          product: { id: 7101989, name: 'Cours de massage tantrique' },
          purchase: { transaction: 'HP205', price: { value: 39.98, currency_value: 'EUR' } },
        },
      }),
    })
    await worker.fetch(req, env)
    const customData = JSON.parse(calls[0].init.body).data[0].custom_data
    assert.deepEqual(customData.content_ids, ['7101989'])
    assert.equal(customData.content_name, 'Cours de massage tantrique')
    assert.equal(customData.content_type, 'product')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST /collect usa o event_id mandado pelo cliente (o mesmo que o script usa no pixel nativo, pra Meta fundir os dois)', async () => {
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
      body: JSON.stringify({ event_name: 'PageView', session_id: 'sess-eid', url: 'https://minhalp.com.br/', event_id: 'client-gerado-uuid-123' }),
    })
    await worker.fetch(req, env)
    const sentBody = JSON.parse(calls[0].init.body)
    assert.equal(sentBody.data[0].event_id, 'client-gerado-uuid-123')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST /collect gera o próprio event_id quando o cliente não manda nenhum', async () => {
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
      body: JSON.stringify({ event_name: 'PageView', session_id: 'sess-no-eid', url: 'https://minhalp.com.br/' }),
    })
    await worker.fetch(req, env)
    const sentBody = JSON.parse(calls[0].init.body)
    assert.match(sentBody.data[0].event_id, /^sess-no-eid:PageView:\d+$/)
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

test('webhook da Hotmart NÃO manda pra Meta quando PURCHASE_PRODUCT_IDS_JSON tem produtos e o product.id da venda não está na lista (order bump/upsell)', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnvWithIngest({ PURCHASE_PRODUCT_IDS_JSON: JSON.stringify(['7101989']) })
    const ctx = makeCtx()
    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: {
          buyer: { name: 'Comprou Upsell', email: 'upsell@exemplo.com' },
          purchase: { transaction: 'HP-UPSELL', price: { value: 47, currency_value: 'BRL' } },
          product: { id: 7104911, name: 'Oral inoubliable' },
        },
      }),
    })
    const res = await worker.fetch(req, env, ctx)
    assert.equal(res.status, 200)
    await Promise.all(ctx._tasks)

    assert.equal(calls.filter(c => c.url.includes('graph.facebook.com')).length, 0, 'não devia mandar pra Meta — produto fora da lista')
    const ingestCall = calls.find(c => c.url === env.INGEST_URL)
    assert.ok(ingestCall, 'ainda devia aparecer no nosso painel')
    const ingestBody = JSON.parse(ingestCall.init.body)
    assert.equal(ingestBody.source, 'pixel')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart MANDA pra Meta quando PURCHASE_PRODUCT_IDS_JSON tem produtos e o product.id da venda está na lista (produto principal)', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnvWithIngest({ PURCHASE_PRODUCT_IDS_JSON: JSON.stringify(['7101989']) })
    const ctx = makeCtx()
    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: {
          buyer: { name: 'Comprou Principal', email: 'principal@exemplo.com' },
          purchase: { transaction: 'HP-PRINCIPAL', price: { value: 97, currency_value: 'BRL' } },
          product: { id: 7101989, name: 'Cours de massage tantrique' },
        },
      }),
    })
    const res = await worker.fetch(req, env, ctx)
    assert.equal(res.status, 200)
    await Promise.all(ctx._tasks)

    assert.equal(calls.filter(c => c.url.includes('graph.facebook.com')).length, 1, 'devia mandar pra Meta — produto principal')
    const ingestCall = calls.find(c => c.url === env.INGEST_URL)
    const ingestBody = JSON.parse(ingestCall.init.body)
    assert.equal(ingestBody.source, 'capi')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart manda pra Meta qualquer produto quando PURCHASE_PRODUCT_IDS_JSON está vazio/ausente (comportamento padrão, compatível)', async () => {
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
          buyer: { name: 'Sem Filtro de Produto', email: 'semfiltroproduto@exemplo.com' },
          purchase: { transaction: 'HP-SEM-FILTRO-PRODUTO', price: { value: 47, currency_value: 'BRL' } },
          product: { id: 999999, name: 'Qualquer Produto' },
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

test('sendToMeta tenta de novo quando a Meta responde erro 5xx (instabilidade passageira) e não desiste na 1ª falha', async () => {
  const originalFetch = globalThis.fetch
  let attempts = 0
  globalThis.fetch = async (url) => {
    if (String(url).includes('graph.facebook.com')) {
      attempts += 1
      if (attempts < 2) return new Response('erro temporário', { status: 503 })
      return new Response('{}', { status: 200 })
    }
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnvWithIngest()
    const ctx = makeCtx()
    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: { buyer: { name: 'Retry Ok', email: 'retry@exemplo.com' }, purchase: { transaction: 'HP-RETRY-OK', price: { value: 97, currency_value: 'BRL' } } },
      }),
    })
    await worker.fetch(req, env, ctx)
    await Promise.all(ctx._tasks)
    assert.equal(attempts, 2, 'esperava 2 tentativas antes de aceitar sucesso')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart marca capi_send_ok:false no ingest quando a Meta rejeita definitivamente (ex: token inválido) — hoje isso ficava invisível, sempre marcado como enviado', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url).includes('graph.facebook.com')) return new Response('token inválido', { status: 400 })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnvWithIngest()
    const ctx = makeCtx()
    const req = new Request('https://sinal.teste.com/webhook/hotmart?secret=segredo123', {
      method: 'POST',
      body: JSON.stringify({
        event: 'PURCHASE_APPROVED',
        data: { buyer: { name: 'Falha Meta', email: 'falha@exemplo.com' }, purchase: { transaction: 'HP-FALHA', price: { value: 97, currency_value: 'BRL' } } },
      }),
    })
    await worker.fetch(req, env, ctx)
    await Promise.all(ctx._tasks)

    const metaCalls = calls.filter(c => c.url.includes('graph.facebook.com'))
    assert.equal(metaCalls.length, 1, 'erro 4xx não deveria gerar retry (não adianta tentar de novo com o mesmo token inválido)')

    const ingestCall = calls.find(c => c.url === env.INGEST_URL)
    const ingestBody = JSON.parse(ingestCall.init.body)
    assert.equal(ingestBody.capi_send_ok, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart marca capi_send_ok:true no ingest quando a Meta aceita, e manda event_id estável (purchase:<transaction>) pra evitar duplicar no nosso próprio painel se a Hotmart reenviar o webhook', async () => {
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
        data: { buyer: { name: 'Sucesso', email: 'sucesso@exemplo.com' }, purchase: { transaction: 'HP-SUCESSO', price: { value: 97, currency_value: 'BRL' } } },
      }),
    })
    await worker.fetch(req, env, ctx)
    await Promise.all(ctx._tasks)

    const ingestCall = calls.find(c => c.url === env.INGEST_URL)
    const ingestBody = JSON.parse(ingestCall.init.body)
    assert.equal(ingestBody.capi_send_ok, true)
    assert.equal(ingestBody.event_id, 'purchase:HP-SUCESSO')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('webhook da Hotmart não marca capi_send_ok (fica null/ausente) quando a venda nem foi enviada por causa do REQUIRE_TRACKER_SRC — capi_send_ok só faz sentido pra quem foi de fato tentado', async () => {
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
          buyer: { name: 'Outro Pixel', email: 'outro@exemplo.com' },
          purchase: { transaction: 'HP-OUTRO-PIXEL', price: { value: 97, currency_value: 'BRL' }, origin: { src: 'outro-pixel-qualquer' } },
        },
      }),
    })
    await worker.fetch(req, env, ctx)
    await Promise.all(ctx._tasks)

    assert.equal(calls.filter(c => c.url.includes('graph.facebook.com')).length, 0)
    const ingestCall = calls.find(c => c.url === env.INGEST_URL)
    const ingestBody = JSON.parse(ingestCall.init.body)
    assert.equal(ingestBody.capi_send_ok, null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST /collect manda event_id e capi_send_ok:true pro ingest quando a Meta aceita o PageView', async () => {
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
      body: JSON.stringify({ event_name: 'PageView', session_id: 'sess-evtid', event_id: 'evt-abc-123' }),
    })
    await worker.fetch(req, env, ctx)
    await Promise.all(ctx._tasks)

    const ingestCall = calls.find(c => c.url === env.INGEST_URL)
    const ingestBody = JSON.parse(ingestCall.init.body)
    assert.equal(ingestBody.event_id, 'evt-abc-123')
    assert.equal(ingestBody.capi_send_ok, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('POST /collect marca capi_send_ok:false quando a Meta rejeita o PageView (hoje ficava marcado como "capi" mesmo falhando)', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url).includes('graph.facebook.com')) return new Response('erro', { status: 400 })
    return new Response('{}', { status: 200 })
  }
  try {
    const env = makeEnvWithIngest()
    const ctx = makeCtx()
    const req = new Request('https://sinal.teste.com/collect', {
      method: 'POST',
      headers: { Origin: 'https://minhalp.com.br', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_name: 'PageView', session_id: 'sess-falha-pv' }),
    })
    await worker.fetch(req, env, ctx)
    await Promise.all(ctx._tasks)

    const ingestCall = calls.find(c => c.url === env.INGEST_URL)
    const ingestBody = JSON.parse(ingestCall.init.body)
    assert.equal(ingestBody.capi_send_ok, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
