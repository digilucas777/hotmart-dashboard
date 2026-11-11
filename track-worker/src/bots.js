// Robôs que abrem a página e rodam o script como se fossem visitantes: o
// verificador de anúncios da Meta (meta-externalads, facebookexternalhit),
// Google, Apple, Ahrefs, HubSpot, navegadores automáticos etc. Eles não podem
// virar PageView no Facebook nem gastar a cota de gravação do KV.
//
// Conferido com dados reais em 07/11/2026 (DashSpeed): 10 mil acessos de robô
// em 30 dias, 9.354 só do meta-externalads.
//  - "(?<!cu)bot": Cubot é marca de celular (gente real no Instagram).
//  - IP da Meta (rede AS32934): só conta como robô quando o navegador NÃO é o
//    app do Instagram/Facebook (ver isBotRequest). Conferido em 11/11/2026:
//    585 sessões em 7 dias vindas da Meta com navegador de celular genérico
//    ("Android 10; K"), 1% de checkout e nenhuma venda: é o verificador de
//    anúncio da Meta disfarçado de celular, que gastava a cota do KV.
// A mesma lista existe no banco (track_is_bot, migration 102 do DashSpeed).
export const BOT_UA_PATTERN = '(?<!cu)bot|crawl|spider|slurp|facebookexternalhit|meta-external|facebookcatalog|headlesschrome|lighthouse|pingdom|hubspot|ahrefs|semrush|mj12|bytespider|googleother|google-inspectiontool|mediapartners|bingpreview|python-requests|curl/|wget/|go-http|axios/|node-fetch|phantomjs|puppeteer|playwright|selenium|scrapy'

const BOT_UA_RE = new RegExp(BOT_UA_PATTERN, 'i')

export function isBotUserAgent(userAgent) {
  return typeof userAgent === 'string' && userAgent !== '' && BOT_UA_RE.test(userAgent)
}

// Faixas de IP da Meta (AS32934). IPv6: 2a03:2880::/32 e 2620:0:1c00::/40.
const META_IPV4 = [
  ['31.13.24.0', 21], ['31.13.64.0', 18], ['45.64.40.0', 22], ['66.220.144.0', 20],
  ['69.63.176.0', 20], ['69.171.224.0', 19], ['74.119.76.0', 22], ['102.132.96.0', 20],
  ['103.4.96.0', 22], ['129.134.0.0', 16], ['147.75.208.0', 20], ['157.240.0.0', 16],
  ['163.70.128.0', 17], ['173.252.64.0', 18], ['179.60.192.0', 22], ['185.60.216.0', 22],
  ['185.89.216.0', 22], ['204.15.20.0', 22],
]
const ipv4Num = ip => ip.split('.').reduce((n, p) => n * 256 + Number(p), 0)
const META_V4 = META_IPV4.map(([base, bits]) => [ipv4Num(base), 2 ** (32 - bits)])

export function isMetaInfraIp(ip) {
  if (typeof ip !== 'string' || ip === '') return false
  const v = ip.toLowerCase()
  if (v.includes(':')) return v.startsWith('2a03:2880:') || /^2620:0?:1c[0-9a-f]{2}:/.test(v)
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return false
  const n = ipv4Num(v)
  return META_V4.some(([b, size]) => n >= b && n < b + size)
}

// App do Instagram/Facebook: gente de verdade, mesmo se a rede for da Meta.
const IN_APP_RE = /FBAN|FBAV|FB_IAB|FBIOS|Instagram/i

// Robô = user-agent de robô, ou IP da Meta com navegador que não é o app.
export function isBotRequest(userAgent, ip) {
  if (isBotUserAgent(userAgent)) return true
  return isMetaInfraIp(ip) && !IN_APP_RE.test(userAgent || '')
}
