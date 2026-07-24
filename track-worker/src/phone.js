// Mapa de DDI (calling code) por país — cobre os mercados que a operação já
// roda hoje (FR) e os que estão previstos (BR, US, ES, DE, IT) mais PT de
// bônus, já que o produto vira multi-país. Países fora desse mapa não têm o
// DDI adivinhado (a Meta ainda recebe o telefone, só sem o prefixo — melhor
// que não mandar nada, mas sem o palpite arriscado de um DDI errado).
const CALLING_CODES = {
  BR: '55',
  FR: '33',
  US: '1',
  ES: '34',
  DE: '49',
  IT: '39',
  PT: '351',
}

export function normalizePhone(rawPhone, countryCode) {
  const digits = String(rawPhone ?? '').replace(/\D/g, '')
  if (!digits) return null

  const callingCode = CALLING_CODES[String(countryCode ?? '').toUpperCase()]
  if (!callingCode) return digits

  if (digits.startsWith(callingCode)) return digits

  // Europa costuma escrever o número local com um "0" de tronco na frente
  // (ex: França 06 12 34 56 78) — esse zero não entra no formato
  // internacional (E.164), precisa cair antes de colar o DDI.
  const withoutTrunkZero = digits.startsWith('0') ? digits.slice(1) : digits
  return callingCode + withoutTrunkZero
}
