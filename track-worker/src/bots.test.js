import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isBotUserAgent } from './bots.js'

test('reconhece os robôs vistos nos dados reais', () => {
  for (const ua of [
    'meta-externalads/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 (compatible; meta-externalads/1.1)',
    'facebookexternalhit/1.1',
    'meta-webindexer/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; HubSpot Crawler; +https://www.hubspot.com) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0; 360Spider',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1)',
    'AdsBot-Google (+http://www.google.com/adsbot.html)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36',
  ]) assert.equal(isBotUserAgent(ua), true, ua)
})

test('não marca gente de verdade como robô', () => {
  for (const ua of [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    'Mozilla/5.0 (Linux; Android 14; KINGKONG STAR 2) AppleWebKit/537.36 Instagram 448.0.0.52.84 Android (34/14; 446dpi; 1080x2400; CUBOT; KINGKONG STAR 2)',
    'Instagram 450.0.0.50.77 Android (36/16; 280dpi; 1200x1920; Teclast; T65_EEA; T65; ums9230_6h10; it_IT; 1084453874)',
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/143.0.0.0 Mobile Safari/537.36',
    '',
  ]) assert.equal(isBotUserAgent(ua), false, ua)
})

import { isBotRequest, isMetaInfraIp } from './bots.js'

test('IP da Meta com celular genérico é robô (verificador de anúncio)', () => {
  const ua = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
  assert.equal(isBotRequest(ua, '2a03:2880:30ff:73::'), true)
  assert.equal(isBotRequest(ua, '173.252.83.10'), true)
  assert.equal(isBotRequest(ua, '157.240.1.1'), true)
})

test('app do Instagram/Facebook na rede da Meta é o revisor de anúncio disfarçado', () => {
  assert.equal(isBotRequest('Mozilla/5.0 (iPad; CPU OS 15_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/19G82 [FBAN/FBIOS;FBAV/494.0.0.50.98;FBBV/67', '2a03:2880:11ff:56::'), true)
  assert.equal(isBotRequest('Mozilla/5.0 (Linux; Android 14) [FBAN/FB4A;FBAV/586.0.0.52.53;]', '2a03:2880:ff:49::'), true)
  assert.equal(isBotRequest('Mozilla/5.0 (iPhone) Instagram 400.0.0', '31.13.70.1'), true)
})

test('app do Instagram/Facebook na internet da pessoa continua sendo gente', () => {
  assert.equal(isBotRequest('Mozilla/5.0 (Linux; Android 14) [FBAN/FB4A;FBAV/586.0.0.52.53;]', '2804:1b3:c403:d098::1'), false)
  assert.equal(isBotRequest('Mozilla/5.0 (iPhone) Instagram 400.0.0', '177.10.2.3'), false)
})


test('IP comum não é da Meta', () => {
  assert.equal(isMetaInfraIp('2804:1b3:c403:d098::1'), false)
  assert.equal(isMetaInfraIp('64.140.144.96'), false)
  assert.equal(isMetaInfraIp('31.13.1.1'), false)
  assert.equal(isMetaInfraIp(''), false)
  assert.equal(isBotRequest('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)', '177.10.2.3'), false)
})
