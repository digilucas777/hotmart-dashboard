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
