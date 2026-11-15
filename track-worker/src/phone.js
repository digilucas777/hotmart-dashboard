// DDI (calling code) e tamanho do número nacional (sem DDI e sem o "0" de
// tronco) dos mercados principais. O tamanho serve pra reconhecer um número
// que JÁ veio no formato internacional de OUTRO país (ex: "525579155017" =
// México) e não colar o DDI errado na frente.
const COUNTRIES = {
  BR: { cc: '55', len: [10, 11] },
  MX: { cc: '52', len: [10] },
  US: { cc: '1', len: [10] },
  AR: { cc: '54', len: [10, 11] },
  CL: { cc: '56', len: [9] },
  CO: { cc: '57', len: [10] },
  PE: { cc: '51', len: [9] },
  UY: { cc: '598', len: [8] },
  PY: { cc: '595', len: [9] },
  BO: { cc: '591', len: [8] },
  EC: { cc: '593', len: [9] },
  VE: { cc: '58', len: [10] },
  CR: { cc: '506', len: [8] },
  PA: { cc: '507', len: [8] },
  GT: { cc: '502', len: [8] },
  SV: { cc: '503', len: [8] },
  HN: { cc: '504', len: [8] },
  NI: { cc: '505', len: [8] },
  ES: { cc: '34', len: [9] },
  FR: { cc: '33', len: [9] },
  IT: { cc: '39', len: [9, 10] },
  DE: { cc: '49', len: [10, 11] },
  PT: { cc: '351', len: [9] },
  GB: { cc: '44', len: [10] },
  CH: { cc: '41', len: [9] },
  BE: { cc: '32', len: [8, 9] },
  NL: { cc: '31', len: [9] },
  AT: { cc: '43', len: [10, 11] },
  AO: { cc: '244', len: [9] },
  MZ: { cc: '258', len: [9] },
}
// Outros países e territórios (só pra reconhecer o país do telefone, não pra
// colar DDI): tamanho nacional aceito de 6 a 10 dígitos.
const OUTROS = {
  GP: '590', MQ: '596', GF: '594', RE: '262', PF: '689', NC: '687', MU: '230', SN: '221', BJ: '229', CI: '225',
  CM: '237', MA: '212', DZ: '213', TN: '216', LU: '352', SE: '46', NO: '47', DK: '45', FI: '358', PL: '48',
  CZ: '420', SK: '421', HU: '36', RO: '40', GR: '30', IE: '353', AD: '376', MT: '356', MC: '377', KR: '82',
  HK: '852', JP: '81', CN: '86', IN: '91', AU: '61', NZ: '64', ZA: '27', IL: '972', AE: '971', TR: '90',
  UA: '380', HR: '385', SI: '386', BG: '359', RS: '381', CV: '238', ST: '239', GW: '245', MO: '853',
}
const ccOf = iso => COUNTRIES[iso]?.cc || OUTROS[iso] || null
// DDIs mais longos primeiro, pra "598" (Uruguai) não ser lido como "59"/"5".
const PRINCIPAIS = Object.entries(COUNTRIES).sort((a, b) => b[1].cc.length - a[1].cc.length)
const SECUNDARIOS = Object.entries(OUTROS).sort((a, b) => b[1].length - a[1].length)

const digitsOf = v => String(v ?? '').replace(/\D/g, '')
const stripTrunk = d => (d.startsWith('0') ? d.slice(1) : d)

// Número já internacional de algum país (DDI + tamanho certo). Aceita o "0"
// de tronco depois do DDI (ex: "49 0151...", erro comum de digitação).
function internationalCountry(digits, skip) {
  for (const [iso, c] of PRINCIPAIS) {
    if (iso === skip || !digits.startsWith(c.cc)) continue
    if (c.len.includes(stripTrunk(digits.slice(c.cc.length)).length)) return iso
  }
  for (const [iso, cc] of SECUNDARIOS) {
    if (iso === skip || !digits.startsWith(cc)) continue
    const rest = stripTrunk(digits.slice(cc.length)).length
    if (rest >= 6 && rest <= 10) return iso
  }
  return null
}

// País que o próprio telefone indica. `hint` = país informado pela
// plataforma; se o número é coerente com ele (com ou sem DDI), fica com ele.
export function detectPhoneCountry(rawPhone, hint) {
  const digits = digitsOf(rawPhone)
  if (!digits) return null
  const h = String(hint ?? '').toUpperCase()
  const cc = ccOf(h)
  if (cc) {
    const rest = digits.length - cc.length
    if (digits.startsWith(cc) && rest >= 6 && rest <= 13) return h
    if (COUNTRIES[h]?.len.includes(stripTrunk(digits).length)) return h
  }
  return internationalCountry(digits, h)
}

export function normalizePhone(rawPhone, countryCode) {
  const digits = digitsOf(rawPhone)
  if (!digits) return null

  const iso = String(countryCode ?? '').toUpperCase()
  const c = COUNTRIES[iso]
  if (!c) return digits

  // Já vem com o DDI do país certo.
  if (digits.startsWith(c.cc) && c.len.includes(digits.length - c.cc.length)) return digits
  // Número nacional do país (Europa escreve com "0" de tronco, que cai antes do DDI).
  const national = stripTrunk(digits)
  if (c.len.includes(national.length)) return c.cc + national
  // Já é internacional de OUTRO país: mantém como veio, nunca cola DDI errado.
  if (internationalCountry(digits, iso)) return digits
  if (digits.startsWith(c.cc)) return digits
  return c.cc + national
}

// País do comprador. A plataforma às vezes manda o país padrão do checkout
// (Hotmart mandou "Brasil" pra um mexicano com IP e telefone do México, 15/11/2026).
// Regra: plataforma e IP da visita concordando, vale isso. Senão o telefone
// decide (confirma a plataforma ou mostra outro país). Sem telefone legível,
// vale o IP da visita e, por último, a plataforma.
export function resolveBuyerCountry({ platformCountry, ipCountry, phone }) {
  const plat = platformCountry ? String(platformCountry).toUpperCase() : null
  const ip = ipCountry ? String(ipCountry).toUpperCase() : null
  if (plat && ip && plat === ip) return plat
  const ph = detectPhoneCountry(phone, plat)
  if (ph) return ph
  return ip || plat || null
}
