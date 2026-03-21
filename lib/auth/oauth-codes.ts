import crypto from 'crypto'

/**
 * Stateless OAuth auth codes.
 * The auth code is an AES-256-GCM encrypted JSON payload containing
 * the API key, PKCE code_challenge, and expiry. No DB storage needed.
 */

const ALGORITHM = 'aes-256-gcm'
const CODE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getEncryptionKey(): Buffer {
  // Derive a 32-byte key from the service role key
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  return crypto.createHash('sha256').update(secret).digest()
}

interface AuthCodePayload {
  apiKey: string
  codeChallenge: string
  codeChallengeMethod: string
  redirectUri: string
  userId: string
  exp: number
}

export function createAuthCode(payload: Omit<AuthCodePayload, 'exp'>): string {
  const data: AuthCodePayload = {
    ...payload,
    exp: Date.now() + CODE_TTL_MS,
  }

  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const json = JSON.stringify(data)
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  // Format: base64url(iv + tag + encrypted)
  const combined = Buffer.concat([iv, tag, encrypted])
  return combined.toString('base64url')
}

export function decryptAuthCode(code: string): AuthCodePayload | null {
  try {
    const key = getEncryptionKey()
    const combined = Buffer.from(code, 'base64url')

    const iv = combined.subarray(0, 12)
    const tag = combined.subarray(12, 28)
    const encrypted = combined.subarray(28)

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    const payload: AuthCodePayload = JSON.parse(decrypted.toString('utf8'))

    // Check expiry
    if (Date.now() > payload.exp) return null

    return payload
  } catch {
    return null
  }
}

/**
 * Verify PKCE: SHA256(code_verifier) must equal the stored code_challenge.
 */
export function verifyPkce(
  codeVerifier: string,
  codeChallenge: string,
  method: string
): boolean {
  if (method === 'plain') {
    return codeVerifier === codeChallenge
  }
  // S256
  const hash = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')
  return hash === codeChallenge
}
