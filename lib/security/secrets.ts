import { createHash, timingSafeEqual } from 'crypto'

// Compara dois segredos sem vazar, pelo tempo de resposta, quantos
// caracteres batem (os hashes têm sempre o mesmo tamanho).
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

// Corta texto vindo de fora antes de gravar, pra ninguém encher o banco.
export function clip(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null
  const s = String(value)
  return s.length > max ? s.slice(0, max) : s
}
