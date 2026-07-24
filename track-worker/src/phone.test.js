import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone } from './phone.js'

test('normalizePhone adiciona o DDI do Brasil quando ausente', () => {
  assert.equal(normalizePhone('11 99999-8888', 'BR'), '5511999998888')
})

test('normalizePhone não duplica o DDI se já vier no número', () => {
  assert.equal(normalizePhone('5511999998888', 'BR'), '5511999998888')
})

test('normalizePhone remove o zero de tronco antes do DDI (França)', () => {
  assert.equal(normalizePhone('06 12 34 56 78', 'FR'), '33612345678')
})

test('normalizePhone remove o zero de tronco antes do DDI (Alemanha)', () => {
  assert.equal(normalizePhone('0176 12345678', 'DE'), '4917612345678')
})

test('normalizePhone funciona pra Espanha, Itália e Portugal', () => {
  assert.equal(normalizePhone('612345678', 'ES'), '34612345678')
  assert.equal(normalizePhone('3123456789', 'IT'), '393123456789')
  assert.equal(normalizePhone('912345678', 'PT'), '351912345678')
})

test('normalizePhone funciona pros EUA', () => {
  assert.equal(normalizePhone('(415) 555-0100', 'US'), '14155550100')
})

test('normalizePhone sem país conhecido devolve só os dígitos, sem adivinhar DDI', () => {
  assert.equal(normalizePhone('+44 20 7946 0958', 'GB'), '442079460958')
})

test('normalizePhone com telefone vazio devolve null', () => {
  assert.equal(normalizePhone('', 'BR'), null)
  assert.equal(normalizePhone(null, 'BR'), null)
})
