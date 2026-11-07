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
