import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone, resolveBuyerCountry, detectPhoneCountry } from './phone.js'

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

test('normalizePhone não cola DDI do Brasil em telefone mexicano (caso real 15/11)', () => {
  assert.equal(normalizePhone('525579155017', 'BR'), '525579155017')
  assert.equal(normalizePhone('525579155017', 'MX'), '525579155017')
  assert.equal(normalizePhone('5579155017', 'MX'), '525579155017')
})

test('resolveBuyerCountry: IP e telefone do México vencem o "Brasil" padrão da Hotmart', () => {
  assert.equal(resolveBuyerCountry({ platformCountry: 'BR', ipCountry: 'MX', phone: '525579155017' }), 'MX')
})

test('resolveBuyerCountry: brasileiro viajando continua BR (telefone confirma a plataforma)', () => {
  assert.equal(resolveBuyerCountry({ platformCountry: 'BR', ipCountry: 'PT', phone: '5511999998888' }), 'BR')
})

test('resolveBuyerCountry: sem visita, telefone internacional de outro país vence', () => {
  assert.equal(resolveBuyerCountry({ platformCountry: 'BR', phone: '525579155017' }), 'MX')
  assert.equal(resolveBuyerCountry({ platformCountry: 'BR', phone: '11999998888' }), 'BR')
  assert.equal(resolveBuyerCountry({ platformCountry: null, ipCountry: 'ES', phone: null }), 'ES')
})

test('detectPhoneCountry reconhece DDI de 3 dígitos', () => {
  assert.equal(detectPhoneCountry('59899123456', null), 'UY')
})

test('resolveBuyerCountry: casos reais do histórico (territórios franceses, Europa)', () => {
  // Guadalupe com IP da França: telefone +590 confirma a Hotmart
  assert.equal(resolveBuyerCountry({ platformCountry: 'GP', ipCountry: 'FR', phone: '590690123456' }), 'GP')
  // Hotmart diz França, IP e telefone da Bélgica
  assert.equal(resolveBuyerCountry({ platformCountry: 'FR', ipCountry: 'BE', phone: '32470123456' }), 'BE')
  // Alemão com IP da França: telefone +49 (com o 0 de tronco) confirma DE
  assert.equal(resolveBuyerCountry({ platformCountry: 'DE', ipCountry: 'FR', phone: '4901511234567' }), 'DE')
  // Hotmart diz Brasil, IP e telefone de Angola
  assert.equal(resolveBuyerCountry({ platformCountry: 'BR', ipCountry: 'AO', phone: '244923456789' }), 'AO')
  // plataforma e IP concordando: nem olha o telefone
  assert.equal(resolveBuyerCountry({ platformCountry: 'FR', ipCountry: 'FR', phone: '32470123456' }), 'FR')
})
