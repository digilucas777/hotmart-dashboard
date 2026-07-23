# Worker de Rastreamento + Deploy Automático — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar, com um clique no botão "Fazer deploy" já existente na interface, um Cloudflare Worker que recebe eventos de rastreamento (`PageView` + gatilhos configuráveis) e o webhook de compra da Hotmart, envia tudo pra Meta via Conversions API, com dados hasheados e (melhor esforço) enriquecidos por sessão.

**Architecture:** Um único script de Worker genérico (`track-worker/src/`, módulos ES puros, sem bundler) é reenviado a cada deploy pra conta Cloudflare de cada instalação, com a configuração (pixels, tokens da CAPI, domínios, secret do webhook) indo junto como variáveis de ambiente/secrets daquele deploy — não como um novo endpoint de config no Next.js. O Next.js só orquestra: descriptografa os tokens da instalação, chama a API REST da Cloudflare (KV, Workers Scripts, Custom Domains) e atualiza o status.

**Tech Stack:** Cloudflare Workers (módulos ES, `fetch` handler), API REST da Cloudflare v4 (`fetch` nativo, sem SDK), Next.js route handler existente, `node:test`/`node:assert` (nativo do Node, sem dependência nova) para os testes do Worker.

## Global Constraints

- Aditivo apenas — não alterar `app/api/webhook/hotmart/route.ts` nem a coluna `vendas.origem`/`extractOrigem` (spec: `docs/superpowers/specs/2026-07-23-track-worker-deploy-design.md`)
- Tokens (Cloudflare, CAPI) só ficam descriptografados em memória no momento do deploy — nunca logados, nunca devolvidos ao navegador (mesma regra de `lib/crypto.ts` da Etapa 1)
- Dados pessoais do comprador sempre hasheados em SHA-256 antes de qualquer envio à Meta
- InitiateCheckout **não** é responsabilidade do Worker (fica a cargo do pixel nativo da Hotmart) — não implementar gatilho automático pra isso
- Sem cruzamento de sessão via parâmetro de URL do checkout (colide com `origem`) — só via e-mail hasheado, melhor esforço
- Sem framework de teste novo — usar `node:test` (nativo, Node 24 já instalado) só dentro de `track-worker/`, já que é JS puro sem build; o lado Next.js segue sem testes automatizados, igual ao resto do projeto
- Next.js 16: rotas usam `await cookies()`/`getAuthenticatedUser()` de `app/api/meta/_utils.ts`, mesmo padrão das rotas de `app/api/track/installations/*` já existentes

---

## Task 1: Hash SHA-256 do Worker (função pura)

**Files:**
- Create: `track-worker/src/hash.js`
- Test: `track-worker/src/hash.test.js`

**Interfaces:**
- Produces: `sha256Hex(input: string): Promise<string>` — usado pelas Tasks 2 e 3

- [ ] **Step 1: Escrever o teste (vai falhar, arquivo ainda não existe)**

```js
// track-worker/src/hash.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sha256Hex } from './hash.js'

test('sha256Hex normaliza (trim + lowercase) antes de hashear', async () => {
  const a = await sha256Hex('Teste@Email.com ')
  const b = await sha256Hex('teste@email.com')
  assert.equal(a, b)
})

test('sha256Hex retorna 64 caracteres hexadecimais', async () => {
  const hash = await sha256Hex('11999998888')
  assert.equal(hash.length, 64)
  assert.match(hash, /^[0-9a-f]+$/)
})

test('sha256Hex de entradas diferentes gera hashes diferentes', async () => {
  const a = await sha256Hex('joao@exemplo.com')
  const b = await sha256Hex('maria@exemplo.com')
  assert.notEqual(a, b)
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test track-worker/src/hash.test.js`
Expected: FAIL — `Cannot find module './hash.js'`

- [ ] **Step 3: Implementar**

```js
// track-worker/src/hash.js
export async function sha256Hex(input) {
  const normalized = String(input ?? '').trim().toLowerCase()
  const data = new TextEncoder().encode(normalized)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test track-worker/src/hash.test.js`
Expected: PASS — 3 testes ok

- [ ] **Step 5: Commit**

```bash
git add track-worker/src/hash.js track-worker/src/hash.test.js
git commit -m "feat: hash SHA-256 do worker de rastreamento"
```

---

## Task 2: Gerador do snippet `/t.js` (função pura)

**Files:**
- Create: `track-worker/src/snippet.js`
- Test: `track-worker/src/snippet.test.js`

**Interfaces:**
- Consumes: nenhuma dependência de outra task
- Produces: `buildSnippet({ sessionTtlDays: number, triggers: Array<{ id: string; tipo: string; meta_event: string; config: object; ativo: boolean }> }): string` — usado pela Task 3

- [ ] **Step 1: Escrever o teste**

```js
// track-worker/src/snippet.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSnippet } from './snippet.js'

test('buildSnippet sempre inclui disparo automático de PageView', () => {
  const code = buildSnippet({ sessionTtlDays: 7, triggers: [] })
  assert.match(code, /send\('PageView'\)/)
  assert.match(code, /window\.HotTrack = \{ track: send \}/)
})

test('buildSnippet ignora gatilho inativo', () => {
  const code = buildSnippet({
    sessionTtlDays: 7,
    triggers: [{ id: 'a1', tipo: 'scroll', meta_event: 'Lead', config: { porcentagem: 50 }, ativo: false }],
  })
  assert.doesNotMatch(code, /scrollY/)
})

test('buildSnippet inclui gatilho click_link com filtro e evento configurados', () => {
  const code = buildSnippet({
    sessionTtlDays: 7,
    triggers: [{ id: 'b2', tipo: 'click_link', meta_event: 'Contact', config: { filtro: 'wa.me', repeticao: 'once_per_page' }, ativo: true }],
  })
  assert.match(code, /"wa\.me"/)
  assert.match(code, /send\("Contact"\)/)
})

test('buildSnippet inclui gatilho scroll com o percentual configurado', () => {
  const code = buildSnippet({
    sessionTtlDays: 7,
    triggers: [{ id: 'c3', tipo: 'scroll', meta_event: 'Lead', config: { porcentagem: 75 }, ativo: true }],
  })
  assert.match(code, /scrolled >= 75/)
})

test('buildSnippet inclui a validade de sessão em segundos no cookie', () => {
  const code = buildSnippet({ sessionTtlDays: 14, triggers: [] })
  assert.match(code, /SESSION_TTL_SECONDS = 1209600/)
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test track-worker/src/snippet.test.js`
Expected: FAIL — `Cannot find module './snippet.js'`

- [ ] **Step 3: Implementar**

```js
// track-worker/src/snippet.js
function jsString(value) {
  return JSON.stringify(value ?? '')
}

function buildTriggerCode(trigger) {
  if (!trigger.ativo) return ''
  const metaEvent = jsString(trigger.meta_event)
  const config = trigger.config || {}
  const triggerId = jsString(trigger.id)

  if (trigger.tipo === 'click_link') {
    const filtro = jsString(config.filtro || '')
    const repeticao = jsString(config.repeticao || 'once_per_page')
    return `
  (function(){
    var fired = false;
    document.addEventListener('click', function(e){
      var a = e.target.closest('a[href]');
      if (!a) return;
      if (${filtro} && a.href.indexOf(${filtro}) === -1) return;
      if (${repeticao} === 'once_per_page' && fired) return;
      if (${repeticao} === 'once_per_session' && getCookie('_ht_fired_' + ${triggerId})) return;
      fired = true;
      if (${repeticao} === 'once_per_session') document.cookie = '_ht_fired_' + ${triggerId} + '=1;path=/;max-age=86400';
      send(${metaEvent});
    }, true);
  })();`
  }

  if (trigger.tipo === 'click_element') {
    const seletor = jsString(config.filtro || '')
    return `
  (function(){
    if (!${seletor}) return;
    var fired = false;
    document.addEventListener('click', function(e){
      var el = e.target.closest(${seletor});
      if (!el || fired) return;
      fired = true;
      send(${metaEvent});
    }, true);
  })();`
  }

  if (trigger.tipo === 'scroll') {
    const pct = Number(config.porcentagem) || 50
    return `
  (function(){
    var fired = false;
    window.addEventListener('scroll', function(){
      if (fired) return;
      var scrolled = (window.scrollY + window.innerHeight) / document.body.scrollHeight * 100;
      if (scrolled >= ${pct}) { fired = true; send(${metaEvent}); }
    }, { passive: true });
  })();`
  }

  if (trigger.tipo === 'time_on_page') {
    const seconds = Number(config.segundos) || 30
    return `
  setTimeout(function(){ send(${metaEvent}); }, ${seconds * 1000});`
  }

  if (trigger.tipo === 'url_visited') {
    const contem = jsString(config.contem || '')
    return `
  (function(){
    if (${contem} && location.href.indexOf(${contem}) !== -1) send(${metaEvent});
  })();`
  }

  if (trigger.tipo === 'form_submit') {
    return `
  document.addEventListener('submit', function(e){
    var form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    var email = null, phone = null, nome = null;
    Array.prototype.forEach.call(form.elements, function(field){
      var name = (field.name || '').toLowerCase().replace(/[-_]/g, '');
      if (!name) return;
      if (name === 'email') email = field.value;
      else if (['tel', 'telefone', 'phone', 'celular', 'whatsapp'].indexOf(name) !== -1) phone = field.value;
      else if (name === 'name' || name === 'nome') nome = field.value;
    });
    send(${metaEvent}, { email: email, phone: phone, nome: nome });
  }, true);`
  }

  if (trigger.tipo === 'video_progress') {
    // Funciona com tags <video> nativas (HTML5/auto). Players customizados (ex:
    // VTURB) que não usam <video> não são suportados nesta versão.
    const thresholds = String(config.percentuais || '25,50,75,100')
      .split(',').map(s => Number(s.trim())).filter(n => n > 0 && n <= 100)
    return `
  (function(){
    var fired = {};
    var thresholds = ${JSON.stringify(thresholds)};
    document.querySelectorAll('video').forEach(function(video){
      video.addEventListener('timeupdate', function(){
        if (!video.duration) return;
        var pct = (video.currentTime / video.duration) * 100;
        thresholds.forEach(function(t){
          if (pct >= t && !fired[t]) { fired[t] = true; send(${metaEvent}, { percentual: t }); }
        });
      });
    });
  })();`
  }

  return ''
}

export function buildSnippet({ sessionTtlDays, triggers }) {
  const sessionTtlSeconds = Math.max(1, Number(sessionTtlDays) || 7) * 86400
  const triggerCode = (triggers || []).map(buildTriggerCode).join('\n')

  return `(function(){
  var COLLECT_URL = '/collect';
  var SESSION_TTL_SECONDS = ${sessionTtlSeconds};
  function getCookie(name){
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function getOrCreateSid(){
    var existing = getCookie('_ht_sid');
    if (existing) return existing;
    var id = (crypto.randomUUID ? crypto.randomUUID() : (String(Date.now()) + Math.random().toString(16).slice(2)));
    document.cookie = '_ht_sid=' + id + ';path=/;max-age=' + SESSION_TTL_SECONDS + ';SameSite=Lax';
    return id;
  }
  function getFbc(){
    var fromCookie = getCookie('_fbc');
    if (fromCookie) return fromCookie;
    var params = new URLSearchParams(location.search);
    var fbclid = params.get('fbclid');
    return fbclid ? ('fb.1.' + Date.now() + '.' + fbclid) : null;
  }
  var sid = getOrCreateSid();
  function send(eventName, extra){
    var payload = {
      event_name: eventName,
      session_id: sid,
      fbp: getCookie('_fbp'),
      fbc: getFbc(),
      url: location.href,
      params: extra || {}
    };
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(COLLECT_URL, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(COLLECT_URL, { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'application/json' } });
    }
  }
  window.HotTrack = { track: send };
  send('PageView');
${triggerCode}
})();`
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test track-worker/src/snippet.test.js`
Expected: PASS — 5 testes ok

- [ ] **Step 5: Commit**

```bash
git add track-worker/src/snippet.js track-worker/src/snippet.test.js
git commit -m "feat: gerador do snippet /t.js do worker de rastreamento"
```

---

## Task 3: Worker principal (`index.js`) — `/t.js`, `/collect`, `/webhook/hotmart`, `/health`

**Files:**
- Create: `track-worker/src/index.js`
- Test: `track-worker/src/index.test.js`
- Create: `track-worker/README.md`

**Interfaces:**
- Consumes: `sha256Hex` (Task 1), `buildSnippet` (Task 2)
- Produces: `export default { fetch(request, env) }` — é este arquivo que a Task 5
  lê e envia pra API da Cloudflare (por nome de arquivo, sem build)
- Variáveis de `env` esperadas (todas strings, viram bindings no deploy):
  `PIXELS_JSON`, `WEBHOOK_SECRET`, `DOMAINS_JSON`, `TRIGGERS_JSON`,
  `SESSION_ENRICHMENT_ENABLED`, `SESSION_TTL_DAYS`, `DIAGNOSTICO_ATIVO`, e o
  binding de KV `SESSIONS` (objeto com `.get`/`.put`, não string)

- [ ] **Step 1: Escrever o teste**

```js
// track-worker/src/index.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from './index.js'

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
    await env.SESSIONS.put('email:' + (await (await import('./hash.js')).sha256Hex('joao@exemplo.com')), JSON.stringify({ fbp: 'fb.1.222', fbc: null, ip: '1.2.3.4', userAgent: 'ua-teste' }))

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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test track-worker/src/index.test.js`
Expected: FAIL — `Cannot find module './index.js'`

- [ ] **Step 3: Implementar**

```js
// track-worker/src/index.js
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
    const ttlSeconds = (Number(env.SESSION_TTL_DAYS) || 7) * 86400
    const sessionData = { fbp: body.fbp || null, fbc: body.fbc || null, ip, userAgent, url: body.url || null }
    await env.SESSIONS.put(`sid:${body.session_id}`, JSON.stringify(sessionData), { expirationTtl: ttlSeconds })

    const email = body.params && body.params.email
    if (email) {
      const emailHash = await sha256Hex(email)
      await env.SESSIONS.put(`email:${emailHash}`, JSON.stringify(sessionData), { expirationTtl: ttlSeconds })
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
    const emailHash = await sha256Hex(buyer.email)
    const stored = await env.SESSIONS.get(`email:${emailHash}`)
    if (stored) {
      const session = JSON.parse(stored)
      if (session.fbp) userData.fbp = session.fbp
      if (session.fbc) userData.fbc = session.fbc
      if (session.ip) userData.client_ip_address = session.ip
      if (session.userAgent) userData.client_user_agent = session.userAgent
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
```

```markdown
<!-- track-worker/README.md -->
# track-worker

Worker Cloudflare do módulo de Rastreamento do hotmart-dashboard. Não é um
projeto separado com deploy próprio — os arquivos de `src/` são lidos direto
pela rota `app/api/track/installations/deploy/route.ts` e enviados como módulos
pra API da Cloudflare a cada clique em "Fazer deploy" na interface.

Rotas: `GET /t.js`, `POST /collect`, `POST /webhook/hotmart`, `GET /health`.

Rodar os testes: `node --test track-worker/src/*.test.js`
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test track-worker/src/index.test.js`
Expected: PASS — 7 testes ok

- [ ] **Step 5: Commit**

```bash
git add track-worker/src/index.js track-worker/src/index.test.js track-worker/README.md
git commit -m "feat: worker principal de rastreamento (collect, webhook, health)"
```

---

## Task 4: Cliente da API REST da Cloudflare

**Files:**
- Create: `lib/track/cloudflareApi.ts`

**Interfaces:**
- Produces: `verifyToken`, `getAccountId`, `getZoneId`, `ensureKvNamespace`,
  `deployWorkerScript`, `ensureCustomDomain` — todas usadas pela Task 5
- Sem framework de teste (segue o padrão do resto do Next.js neste projeto,
  sem testes automatizados em rotas/lib) — verificação é manual, na Task 6

- [ ] **Step 1: Implementar**

```ts
// lib/track/cloudflareApi.ts
const CF_API = 'https://api.cloudflare.com/client/v4'

type CfError = { code: number; message: string }
type CfResult<T> = { success: boolean; result: T; errors: CfError[] }

async function cfFetch<T>(path: string, token: string, init?: RequestInit): Promise<CfResult<T>> {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
  return res.json() as Promise<CfResult<T>>
}

export async function verifyToken(token: string): Promise<{ ok: boolean; error?: string }> {
  const result = await cfFetch<{ status: string }>('/user/tokens/verify', token)
  if (!result.success) return { ok: false, error: result.errors?.[0]?.message ?? 'token inválido' }
  return { ok: result.result?.status === 'active' }
}

export async function getAccountId(token: string): Promise<string> {
  const result = await cfFetch<{ id: string; name: string }[]>('/accounts', token)
  if (!result.success || !result.result?.[0]) {
    throw new Error(result.errors?.[0]?.message ?? 'não foi possível listar contas Cloudflare — confira as permissões do token')
  }
  return result.result[0].id
}

export async function getZoneId(token: string, domain: string): Promise<string | null> {
  const result = await cfFetch<{ id: string }[]>(`/zones?name=${encodeURIComponent(domain)}`, token)
  if (!result.success || !result.result?.[0]) return null
  return result.result[0].id
}

export async function ensureKvNamespace(token: string, accountId: string, title: string): Promise<string> {
  const list = await cfFetch<{ id: string; title: string }[]>(`/accounts/${accountId}/storage/kv/namespaces`, token)
  const existing = list.result?.find(ns => ns.title === title)
  if (existing) return existing.id

  const created = await cfFetch<{ id: string }>(`/accounts/${accountId}/storage/kv/namespaces`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!created.success || !created.result) {
    throw new Error(created.errors?.[0]?.message ?? 'não foi possível criar o KV namespace — confira a permissão Workers KV Storage: Edit no token')
  }
  return created.result.id
}

export type WorkerModule = { filename: string; content: string }
export type WorkerBinding =
  | { type: 'plain_text'; name: string; text: string }
  | { type: 'secret_text'; name: string; text: string }
  | { type: 'kv_namespace'; name: string; namespace_id: string }

export async function deployWorkerScript(
  token: string,
  accountId: string,
  scriptName: string,
  modules: WorkerModule[],
  bindings: WorkerBinding[],
): Promise<void> {
  const metadata = {
    main_module: modules[0].filename,
    bindings,
    compatibility_date: '2026-01-01',
  }
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  for (const mod of modules) {
    form.append(mod.filename, new Blob([mod.content], { type: 'application/javascript+module' }), mod.filename)
  }

  const res = await fetch(`${CF_API}/accounts/${accountId}/workers/scripts/${scriptName}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const parsed = await res.json() as CfResult<unknown>
  if (!parsed.success) {
    throw new Error(parsed.errors?.[0]?.message ?? 'não foi possível publicar o Worker — confira a permissão Workers Scripts: Edit no token')
  }
}

export async function ensureCustomDomain(
  token: string,
  accountId: string,
  zoneId: string,
  hostname: string,
  scriptName: string,
): Promise<void> {
  const result = await cfFetch(`/accounts/${accountId}/workers/domains`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostname, zone_id: zoneId, service: scriptName, environment: 'production' }),
  })
  if (!result.success) {
    throw new Error(result.errors?.[0]?.message ?? 'não foi possível criar o domínio customizado do Worker — confira a permissão Zone DNS: Edit no token')
  }
}
```

- [ ] **Step 2: Rodar o type-check**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `lib/track/cloudflareApi.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/track/cloudflareApi.ts
git commit -m "feat: cliente da API REST da Cloudflare para deploy do worker"
```

---

## Task 5: Rota de deploy + botão "Fazer deploy" + avisos na interface

**Files:**
- Create: `app/api/track/installations/deploy/route.ts`
- Modify: `app/rastreamento/_components/InstallationModal.tsx`

**Interfaces:**
- Consumes: `lib/track/cloudflareApi.ts` (Task 4), `lib/crypto.ts` (`decryptSecret`,
  já existente da Etapa 1), arquivos `track-worker/src/hash.js`,
  `track-worker/src/snippet.js`, `track-worker/src/index.js` (Task 1-3, lidos
  como texto puro via `fs.readFileSync`)
- Produces: `POST /api/track/installations/deploy` `{ id: string }` →
  `{ ok: true }` ou `{ error: string }`

- [ ] **Step 1: Implementar a rota de deploy**

```ts
// app/api/track/installations/deploy/route.ts
import { readFileSync } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/app/api/meta/_utils'
import { decryptSecret } from '@/lib/crypto'
import {
  deployWorkerScript, ensureCustomDomain, ensureKvNamespace, getAccountId, getZoneId, verifyToken,
  type WorkerBinding,
} from '@/lib/track/cloudflareApi'

function scriptNameFor(installationId: string): string {
  return `track-${installationId.replace(/-/g, '').slice(0, 16)}`
}

function readWorkerModules() {
  const dir = path.join(process.cwd(), 'track-worker', 'src')
  return [
    { filename: 'index.js', content: readFileSync(path.join(dir, 'index.js'), 'utf8') },
    { filename: 'hash.js', content: readFileSync(path.join(dir, 'hash.js'), 'utf8') },
    { filename: 'snippet.js', content: readFileSync(path.join(dir, 'snippet.js'), 'utf8') },
  ]
}

type PixelRow = { pixel_id: string; capi_token_encrypted: string | null; test_event_code: string | null }
type DomainRow = { domain: string; tipo: string }

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await request.json().catch(() => ({})) as { id?: string }
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

  const { data: installation, error: fetchError } = await supabase
    .from('track_installations')
    .select('*, track_pixels(*), track_domains(*), track_triggers(*)')
    .eq('id', id)
    .single()
  if (fetchError || !installation) return NextResponse.json({ error: 'instalação não encontrada' }, { status: 404 })

  if (!installation.cloudflare_api_token_encrypted) {
    return NextResponse.json({ error: 'cole o token da Cloudflare na seção 1 antes de fazer deploy' }, { status: 400 })
  }
  if (!installation.worker_subdomain) {
    return NextResponse.json({ error: 'defina o subdomínio do Worker na seção 2 antes de fazer deploy' }, { status: 400 })
  }
  const pixels = (installation.track_pixels ?? []) as PixelRow[]
  if (pixels.length === 0) {
    return NextResponse.json({ error: 'adicione ao menos um pixel antes de fazer deploy' }, { status: 400 })
  }

  const token = decryptSecret(installation.cloudflare_api_token_encrypted)

  try {
    const verification = await verifyToken(token)
    if (!verification.ok) {
      return NextResponse.json({ error: verification.error ?? 'token da Cloudflare inválido ou revogado' }, { status: 400 })
    }

    const accountId = await getAccountId(token)

    const rootDomain = installation.worker_subdomain.split('.').slice(-2).join('.')
    const zoneId = await getZoneId(token, rootDomain)
    if (!zoneId) {
      return NextResponse.json(
        { error: `domínio ${rootDomain} não encontrado nessa conta Cloudflare — confirme se ele já foi adicionado lá` },
        { status: 400 },
      )
    }

    const scriptName = scriptNameFor(installation.id)
    const kvNamespaceId = await ensureKvNamespace(token, accountId, `track_sessions_${installation.id}`)

    const lpDomains = (installation.track_domains ?? [])
      .filter((d: DomainRow) => d.tipo === 'lp')
      .map((d: DomainRow) => d.domain)

    const bindings: WorkerBinding[] = [
      { type: 'kv_namespace', name: 'SESSIONS', namespace_id: kvNamespaceId },
      {
        type: 'secret_text',
        name: 'PIXELS_JSON',
        text: JSON.stringify(pixels.map(p => ({
          pixel_id: p.pixel_id,
          capi_token: p.capi_token_encrypted ? decryptSecret(p.capi_token_encrypted) : '',
          test_event_code: p.test_event_code,
        }))),
      },
      { type: 'secret_text', name: 'WEBHOOK_SECRET', text: installation.webhook_secret },
      { type: 'plain_text', name: 'DOMAINS_JSON', text: JSON.stringify(lpDomains) },
      { type: 'plain_text', name: 'TRIGGERS_JSON', text: JSON.stringify(installation.track_triggers ?? []) },
      { type: 'plain_text', name: 'SESSION_ENRICHMENT_ENABLED', text: String(installation.session_enrichment_enabled) },
      { type: 'plain_text', name: 'SESSION_TTL_DAYS', text: String(installation.session_ttl_days) },
      { type: 'plain_text', name: 'DIAGNOSTICO_ATIVO', text: String(installation.diagnostico_ativo) },
    ]

    await deployWorkerScript(token, accountId, scriptName, readWorkerModules(), bindings)
    await ensureCustomDomain(token, accountId, zoneId, installation.worker_subdomain, scriptName)

    await supabase.from('track_installations').update({
      status: 'deployed',
      cloudflare_account_id: accountId,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erro desconhecido no deploy'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verificar o type-check**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `app/api/track/installations/deploy/route.ts`

- [ ] **Step 3: Ligar o botão "Fazer deploy" e adicionar os 2 avisos na interface**

Em `app/rastreamento/_components/InstallationModal.tsx`:

3a. Adicionar estado de deploy, logo abaixo dos outros `useState` do componente:

```tsx
  const [deploying, setDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
```

3b. Adicionar a função de deploy, ao lado de `handleSave`:

```tsx
  async function handleDeploy() {
    if (!installation) return
    setDeploying(true)
    setDeployError(null)
    try {
      const res = await fetch('/api/track/installations/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: installation.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDeployError(json?.error || 'Não foi possível publicar o Worker.')
        return
      }
      onSaved()
    } finally {
      setDeploying(false)
    }
  }
```

3c. Substituir o bloco de erro genérico do topo do modal (que hoje só mostra
`error`) por um que também mostra `deployError`:

```tsx
        {(error || deployError) && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
            {error || deployError}
          </div>
        )}
```

3d. Na Seção 4 (Webhook de compra), logo abaixo do `<h3>` de título da seção,
adicionar o aviso sobre desativar o Purchase nativo da Hotmart:

```tsx
          <div className="flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
            <span>⚠️</span>
            <p>
              Antes de ativar: vá em <strong>Hotmart → seu produto → Pixels de Rastreamento</strong> e
              desmarque o evento <strong>Purchase</strong>, deixando só <strong>InitiateCheckout</strong> marcado.
              Sem isso, a venda é contada em dobro na Meta (uma vez pelo pixel nativo da Hotmart, outra pela
              nossa integração).
            </p>
          </div>
```

3e. No toggle "Enriquecer com dados de sessão", adicionar a nota sobre o
requisito de captura de e-mail:

```tsx
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={sessionEnrichment} onChange={e => setSessionEnrichment(e.target.checked)} className="h-4 w-4 rounded" />
            Enriquecer com dados de sessão (geo, IP, fbp, fbc)
          </label>
          <p className="text-[11px] text-slate-600">
            Só tem efeito no Purchase se algum gatilho de formulário (seção 3) capturar o e-mail da pessoa
            <strong> antes</strong> dela ir pro checkout. Se seu funil vai direto pro checkout da Hotmart sem
            passar por um formulário seu, pode deixar ligado — só não vai ter o que cruzar ainda.
          </p>
```

3f. No rodapé do modal, ao lado do botão "Salvar", adicionar o botão "Fazer
deploy" (só aparece editando uma instalação já salva, precisa de `id`):

```tsx
      <div className="flex gap-2 pt-4">
        <Button variant="ghost" className="flex-1" onClick={onClose}>Fechar</Button>
        <Button className="flex-1" onClick={handleSave} disabled={!nome.trim() || saving}>
          {saving && <Spinner size={14} />}
          Salvar
        </Button>
        {installation && (
          <Button className="flex-1" variant="outline" onClick={handleDeploy} disabled={deploying}>
            {deploying && <Spinner size={14} />}
            Fazer deploy
          </Button>
        )}
      </div>
```

- [ ] **Step 4: Rodar o type-check e o build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros; rota `/api/track/installations/deploy` aparece na lista de
rotas do build

- [ ] **Step 5: Commit**

```bash
git add app/api/track/installations/deploy/route.ts app/rastreamento/_components/InstallationModal.tsx
git commit -m "feat: deploy automatico do worker via botao Fazer deploy"
```

---

## Task 6: Verificação manual de ponta a ponta

**Files:** nenhum arquivo novo — só testes manuais

- [ ] **Step 1: Rodar todos os testes do Worker de uma vez**

Run: `node --test track-worker/src/`
Expected: todos os testes (hash, snippet, index) PASS

- [ ] **Step 2: No dashboard (`/rastreamento`), editar a instalação real (já
criada nesta conversa) com o pixel e domínio do produto de teste, e clicar em
**Fazer deploy**

Expected: mensagem de sucesso (sem erro vermelho); status do card na lista muda
de "Rascunho" pra "Publicado"

- [ ] **Step 3: Conferir na conta Cloudflare do usuário (dash.cloudflare.com →
Workers Routes / Overview do domínio) que o Worker e a rota do subdomínio
apareceram**

- [ ] **Step 4: Testar `GET https://{worker_subdomain}/health`** (no navegador)

Expected: JSON `{ "ok": true, "version": "1.0.0", "pixels": 1 }`

- [ ] **Step 5: Colar `<script src="https://{worker_subdomain}/t.js"></script>`
numa página de teste, abrir a página, e conferir no Gerenciador de Eventos da
Meta (com código de teste preenchido na instalação) que o `PageView` chegou**

- [ ] **Step 6: Confirmar no produto da Hotmart que "Pixels de Rastreamento"
está com Purchase desmarcado e InitiateCheckout marcado**

- [ ] **Step 7: Fazer uma compra de teste do produto e confirmar no Gerenciador
de Eventos que o `Purchase` chegou, com os dados do comprador**

- [ ] **Step 8: Commit final (se algo precisou de ajuste durante o teste
manual)**

```bash
git add -A
git commit -m "fix: ajustes pos-teste manual do worker de rastreamento"
```

---

## Self-Review

**Cobertura do spec:**
- Worker genérico reutilizável, config via env/bindings ✅ (Tasks 3-5)
- `/t.js`, `/collect`, `/webhook/hotmart`, `/health` ✅ (Task 3)
- PageView automático, InitiateCheckout delegado à Hotmart (nada implementado
  no Worker pra isso, conforme decidido) ✅
- Purchase via webhook próprio, hash SHA-256, sem tocar em `origem`/`vendas` ✅
- Enriquecimento por e-mail (melhor esforço) ✅ (Task 3)
- Deploy automático via API Cloudflare (token da instalação, KV, script,
  domínio customizado) ✅ (Tasks 4-5)
- Avisos na interface (desativar Purchase na Hotmart; requisito de formulário
  pro enriquecimento) ✅ (Task 5, steps 3d/3e)
- Multi-tenant (token por instalação) ✅ (Task 5, usa sempre o token daquela
  instalação)

**Placeholders:** nenhum "TBD"/"TODO" — todo código é completo e executável.

**Consistência de tipos:** `WorkerBinding`/`WorkerModule` (Task 4) usados
exatamente como declarados na Task 5; nomes de variável de ambiente
(`PIXELS_JSON`, `DOMAINS_JSON`, `TRIGGERS_JSON`, `WEBHOOK_SECRET`,
`SESSION_ENRICHMENT_ENABLED`, `SESSION_TTL_DAYS`, `DIAGNOSTICO_ATIVO`) usados de
forma idêntica entre a Task 3 (`index.js`, quem lê) e a Task 5 (rota de deploy,
quem escreve).
