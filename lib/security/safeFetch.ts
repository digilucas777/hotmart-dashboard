import { lookup } from 'dns/promises'
import { isIP } from 'net'

// Nome de domínio comum (sem porta, sem caminho, sem caractere estranho).
export const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

export function isValidHostname(value: string): boolean {
  return HOSTNAME_RE.test(value.trim())
}

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some(n => Number.isNaN(n))) return true
  const [a, b] = p
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) ||           // link-local / metadados de nuvem
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function isPrivateIP(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIPv4(ip)
  const v = ip.toLowerCase()
  if (v === '::' || v === '::1') return true
  if (v.startsWith('::ffff:')) return isPrivateIPv4(v.slice(7))
  return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff')
}

async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocolo não permitido')
  if (u.port && u.port !== '80' && u.port !== '443') throw new Error('porta não permitida')
  if (u.username || u.password) throw new Error('URL com usuário/senha não permitida')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    if (isPrivateIP(host)) throw new Error('endereço interno não permitido')
  } else {
    if (!isValidHostname(host)) throw new Error('domínio inválido')
    const addrs = await lookup(host, { all: true })
    if (addrs.length === 0 || addrs.some(a => isPrivateIP(a.address))) throw new Error('endereço interno não permitido')
  }
  return u
}

// Busca uma página pública de cliente sem deixar o servidor ser usado pra
// acessar rede interna (SSRF): valida cada salto de redirecionamento,
// só portas 80/443, e corta respostas grandes.
export async function safePublicFetchText(raw: string, maxBytes = 2_000_000): Promise<{ ok: boolean; text: string }> {
  let current = raw
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertPublicUrl(current)
    const res = await fetch(u, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrackSpeedCheck/1.0)' },
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return { ok: false, text: '' }
      current = new URL(loc, u).toString()
      continue
    }
    if (!res.ok || !res.body) return { ok: false, text: '' }
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) { await reader.cancel(); break }
      chunks.push(value)
    }
    return { ok: true, text: Buffer.concat(chunks).toString('utf8') }
  }
  return { ok: false, text: '' }
}
