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

test('GET /t.js retorna javascript com PageView automático', async () => {
  const env = makeEnv()
  const res = await worker.fetch(new Request('https://sinal.teste.com/t.js'), env)
  const body = await res.text()
  assert.equal(res.headers.get('Content-Type'), 'application/javascript; charset=utf-8')
  assert.match(body, /send\('PageView'\)/)
})

test('GET /health retorna a contagem de pixels configurados', async () => {
  const env = makeEnv()
  const res = await worker.fetch(new Request('https://sinal.teste.com/health'), env)
  const json = await res.json()
  assert.equal(json.ok, true)
  assert.equal(json.pixels, 1)
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

test('POST /collect salva sessão e e-mail no KV quando enriquecimento está ligado', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  try {
    const env = makeEnv()
    const req = new Request('https://sinal.teste.com/collect', {
      method: 'POST',
      headers: { Origin: 'https://minhalp.com.br', 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_name: 'Lead', session_id: 'sess1', url: 'https://minhalp.com.br/', params: { email: 'joao@exemplo.com' } }),
    })
    await worker.fetch(req, env)
    assert.ok(env.SESSIONS._store.has('sid:sess1'))
    const emailKeys = [...env.SESSIONS._store.keys()].filter(k => k.startsWith('email:'))
    assert.equal(emailKeys.length, 1)
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
