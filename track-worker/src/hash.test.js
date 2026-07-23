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
