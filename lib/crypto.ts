import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const raw = process.env.TRACK_ENCRYPTION_KEY
  if (!raw) throw new Error('TRACK_ENCRYPTION_KEY não configurada')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('TRACK_ENCRYPTION_KEY precisa decodificar para 32 bytes (base64)')
  return key
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv, authTag, encrypted].map(b => b.toString('base64')).join('.')
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return decrypted.toString('utf8')
}

export function maskSecret(plain: string | null | undefined): string | null {
  if (!plain) return null
  return `••••${plain.slice(-4)}`
}

export function maskEncrypted(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null
  return maskSecret(decryptSecret(encrypted))
}
