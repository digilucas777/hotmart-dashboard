// Converte o país salvo na venda (vem como NOME, em vários idiomas: "Brasil",
// "United States", "Mexico", "Deutschland"...) pro código ISO de 2 letras, pra
// mostrar bandeira (public/flags/xx.svg, copiadas do pacote country-flag-icons, MIT)
// e o nome em português.
const CODIGOS = 'AC AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET EU FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU IC ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TA TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW '.trim().split(' ')

const ALIASES: Record<string, string> = {
  usa: 'US', 'u.s.a.': 'US', 'united states of america': 'US', eua: 'US', 'estados unidos da america': 'US',
  uk: 'GB', 'great britain': 'GB', england: 'GB', inglaterra: 'GB', 'reino unido': 'GB',
  'south korea': 'KR', 'korea, republic of': 'KR', 'saint kitts and nevis': 'KN', 'saint pierre and miquelon': 'PM', 'coreia do sul': 'KR', russia: 'RU', 'russian federation': 'RU',
  'czech republic': 'CZ', 'republica checa': 'CZ', holland: 'NL', 'the netherlands': 'NL', 'viet nam': 'VN',
  'ivory coast': 'CI', "cote d'ivoire": 'CI', 'puerto rico': 'PR', 'dominican republic': 'DO', 'republica dominicana': 'DO',
  bolivia: 'BO', venezuela: 'VE', iran: 'IR', syria: 'SY', tanzania: 'TZ', moldova: 'MD', 'hong kong': 'HK', taiwan: 'TW',
  // nomes no padrão antigo da Hotmart (ISO "nome oficial")
  turkey: 'TR', 'taiwan, province of china': 'TW', 'tanzania, united republic of': 'TZ',
  'united states minor outlying islands': 'UM', 'virgin islands, u.s.': 'VI', 'virgin islands, british': 'VG',
  'palestinian territory, occupied': 'PS', 'netherlands antilles': 'CW', macao: 'MO',
  'macedonia, the former yugoslav republic of': 'MK', holanda: 'NL', swaziland: 'SZ', melilla: 'ES',
  'micronesia, federated states of': 'FM', 'falkland islands (malvinas)': 'FK', 'moldova, republic of': 'MD',
  'brunei darussalam': 'BN', 'cape verde': 'CV', curacao: 'CW', reunion: 'RE',
}

const sem = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ').trim()

let mapa: Map<string, string> | null = null
function montarMapa() {
  const m = new Map<string, string>()
  for (const lang of ['en', 'pt-BR', 'pt-PT', 'es', 'fr', 'it', 'de']) {
    let dn: Intl.DisplayNames
    try { dn = new Intl.DisplayNames([lang], { type: 'region' }) } catch { continue }
    for (const c of CODIGOS) {
      try {
        const nome = dn.of(c)
        if (nome && nome !== c && !m.has(sem(nome))) m.set(sem(nome), c)
      } catch { /* código sem nome nesse idioma */ }
    }
  }
  for (const [k, v] of Object.entries(ALIASES)) m.set(sem(k), v)
  return m
}

export function codigoPais(valor: string | null | undefined): string | null {
  if (!valor) return null
  const v = valor.trim()
  if (/^[A-Za-z]{2}$/.test(v)) return CODIGOS.includes(v.toUpperCase()) ? v.toUpperCase() : null
  mapa ??= montarMapa()
  return mapa.get(sem(v)) ?? null
}

let nomesPt: Intl.DisplayNames | null = null
export function nomePaisPt(valor: string | null | undefined): string {
  if (!valor || valor === 'Desconhecido' || valor === 'Unknown') return 'Não informado'
  if (valor === 'Outros') return 'Outros'
  const c = codigoPais(valor)
  if (!c) return valor
  try {
    nomesPt ??= new Intl.DisplayNames(['pt-BR'], { type: 'region' })
    return nomesPt.of(c) ?? valor
  } catch {
    return valor
  }
}

export const urlBandeira = (codigo: string) => `/flags/${codigo.toLowerCase()}.svg`
