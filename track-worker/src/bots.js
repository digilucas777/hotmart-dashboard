// Robôs que abrem a página e rodam o script como se fossem visitantes: o
// verificador de anúncios da Meta (meta-externalads, facebookexternalhit),
// Google, Apple, Ahrefs, HubSpot, navegadores automáticos etc. Eles não podem
// virar PageView no Facebook nem gastar a cota de gravação do KV.
//
// Conferido com dados reais em 07/11/2026 (DashSpeed): 10 mil acessos de robô
// em 30 dias, 9.354 só do meta-externalads.
//  - "(?<!cu)bot": Cubot é marca de celular (gente real no Instagram).
//  - NÃO usar o IP/ASN da Meta: quase todo acesso vindo dele é gente de
//    verdade no navegador do Instagram/Facebook, com clique de anúncio.
// A mesma lista existe no banco (track_is_bot, migration 102 do DashSpeed).
export const BOT_UA_PATTERN = '(?<!cu)bot|crawl|spider|slurp|facebookexternalhit|meta-external|facebookcatalog|headlesschrome|lighthouse|pingdom|hubspot|ahrefs|semrush|mj12|bytespider|googleother|google-inspectiontool|mediapartners|bingpreview|python-requests|curl/|wget/|go-http|axios/|node-fetch|phantomjs|puppeteer|playwright|selenium|scrapy'

const BOT_UA_RE = new RegExp(BOT_UA_PATTERN, 'i')

export function isBotUserAgent(userAgent) {
  return typeof userAgent === 'string' && userAgent !== '' && BOT_UA_RE.test(userAgent)
}
