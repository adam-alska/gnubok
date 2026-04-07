import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

export function getGmailEncryptionKey(): Buffer {
  const secret = process.env.GMAIL_TOKEN_ENCRYPTION_KEY
  if (!secret) throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY is required')
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptState(payload: Record<string, unknown>): string {
  const key = getGmailEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const json = JSON.stringify(payload)
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function decryptState(encoded: string): Record<string, unknown> | null {
  try {
    const key = getGmailEncryptionKey()
    const combined = Buffer.from(encoded, 'base64url')
    const iv = combined.subarray(0, 12)
    const tag = combined.subarray(12, 28)
    const encrypted = combined.subarray(28)
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return JSON.parse(decrypted.toString('utf8'))
  } catch {
    return null
  }
}

export function encryptToken(plaintext: string): string {
  const key = getGmailEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

export function decryptToken(encoded: string): string | null {
  try {
    const key = getGmailEncryptionKey()
    const combined = Buffer.from(encoded, 'base64url')
    const iv = combined.subarray(0, 12)
    const tag = combined.subarray(12, 28)
    const encrypted = combined.subarray(28)
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    return null
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  if (!response.ok) return null
  const data = await response.json() as { access_token: string }
  return data.access_token
}
