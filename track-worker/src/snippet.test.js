import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSnippet } from './snippet.js'

test('buildSnippet sempre inclui disparo automático de PageView', () => {
  const code = buildSnippet({ sessionTtlDays: 7, triggers: [] })
  assert.match(code, /send\('PageView'\)/)
  assert.match(code, /window\.HotTrack = \{ track: send \}/)
})

test('buildSnippet usa URL absoluta do Worker pro /collect (script roda no domínio da página, não no dele)', () => {
  const code = buildSnippet({ sessionTtlDays: 7, triggers: [], workerOrigin: 'https://sinal.lecoursdejoy.store' })
  assert.match(code, /COLLECT_URL = "https:\/\/sinal\.lecoursdejoy\.store" \+ '\/collect'/)
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

test('buildSnippet captura utm_* da URL e manda no payload (pra saber de onde veio o clique)', () => {
  const code = buildSnippet({ sessionTtlDays: 7, triggers: [] })
  assert.match(code, /function getOrCreateUtm\(\)/)
  assert.match(code, /'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'/)
  assert.match(code, /utm: utm/)
})

test('buildSnippet manda o evento via fetch com keepalive, não sendBeacon (sendBeacon se mostrou pouco confiável em teste real)', () => {
  const code = buildSnippet({ sessionTtlDays: 7, triggers: [] })
  assert.doesNotMatch(code, /navigator\.sendBeacon\(/)
  assert.match(code, /fetch\(COLLECT_URL, \{ method: 'POST', body: body, keepalive: true/)
})

test('buildSnippet gera _fbp e _fbc sozinho (sem depender do pixel nativo da Meta)', () => {
  const code = buildSnippet({ sessionTtlDays: 7, triggers: [] })
  assert.match(code, /function getOrCreateFbp\(\)/)
  assert.match(code, /_fbp=' \+ id/)
  assert.match(code, /function getOrCreateFbc\(\)/)
  assert.match(code, /_fbc=' \+ id/)
})

test('buildSnippet marca new_session via sessionStorage (1x por sessão, não por página)', () => {
  const code = buildSnippet({ sessionTtlDays: 7, triggers: [] })
  assert.match(code, /function isNewSession\(\)/)
  assert.match(code, /sessionStorage\.getItem\('_ht_registered'\)/)
  assert.match(code, /new_session: isNewSession\(\)/)
})

test('buildSnippet sem domínios de checkout não inclui o decorador de links', () => {
  const code = buildSnippet({ sessionTtlDays: 7, triggers: [] })
  assert.doesNotMatch(code, /isCheckoutLink/)
})

test('buildSnippet com domínios de checkout inclui o decorador com os hosts certos', () => {
  const code = buildSnippet({ sessionTtlDays: 7, triggers: [], checkoutDomains: ['pay.hotmart.com', 'go.hotmart.com'] })
  assert.match(code, /isCheckoutLink/)
  assert.match(code, /"pay\.hotmart\.com"/)
  assert.match(code, /"go\.hotmart\.com"/)
  assert.match(code, /searchParams\.set\('sck', sid\)/)
  assert.match(code, /new MutationObserver\(decorateAll\)/)
})

test('buildSnippet cola "src=rastreamento-tracker" no link de checkout (diferencia venda desse funil de venda de outro pixel)', () => {
  const code = buildSnippet({ sessionTtlDays: 7, triggers: [], checkoutDomains: ['pay.hotmart.com'] })
  assert.match(code, /searchParams\.has\('src'\)/)
  assert.match(code, /searchParams\.set\('src', 'rastreamento-tracker'\)/)
})

test('buildSnippet com domínios de checkout manda InitiateCheckout pro MONITOR_URL ao clicar (nunca pro COLLECT_URL/Meta)', () => {
  const code = buildSnippet({ sessionTtlDays: 7, triggers: [], checkoutDomains: ['pay.hotmart.com'], workerOrigin: 'https://sinal.teste.com' })
  assert.match(code, /var MONITOR_URL = "https:\/\/sinal\.teste\.com" \+ '\/monitor'/)
  assert.match(code, /fetch\(MONITOR_URL, \{/)
  assert.match(code, /event_name: 'InitiateCheckout'/)
})

test('buildSnippet captura "src" da URL (exibição no painel, não usado pra cruzar sessão)', () => {
  const code = buildSnippet({ sessionTtlDays: 7, triggers: [] })
  assert.match(code, /function getOrCreateSrc\(\)/)
  assert.match(code, /'src'/)
  assert.match(code, /src: src/)
})
