import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// AES-256-GCM encryption for TikTok tokens
// Format: iv:authTag:encrypted (all base64 encoded)

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const key = process.env.TIKTOK_ENCRYPTION_KEY
  if (!key) {
    throw new Error('TIKTOK_ENCRYPTION_KEY environment variable is not set')
  }

  // The key should be a 32-byte base64 string
  const keyBuffer = Buffer.from(key, 'base64')
  if (keyBuffer.length !== 32) {
    throw new Error('TIKTOK_ENCRYPTION_KEY must be a 32-byte base64 encoded string')
  }

  return keyBuffer
}

/**
 * Encrypt a token using AES-256-GCM
 * @param plaintext The token to encrypt
 * @returns Encrypted string in format: iv:authTag:encrypted (base64)
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  // Combine: iv:authTag:encrypted
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
}

/**
 * Decrypt a token using AES-256-GCM
 * @param encryptedString The encrypted string in format: iv:authTag:encrypted
 * @returns The decrypted token
 */
export function decryptToken(encryptedString: string): string {
  const key = getEncryptionKey()

  const parts = encryptedString.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format')
  }

  const [ivBase64, authTagBase64, encrypted] = parts
  const iv = Buffer.from(ivBase64, 'base64')
  const authTag = Buffer.from(authTagBase64, 'base64')

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length')
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid auth tag length')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, 'base64', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Encrypt both access and refresh tokens
 */
export function encryptTokens(accessToken: string, refreshToken: string): {
  access_token_encrypted: string
  refresh_token_encrypted: string
} {
  return {
    access_token_encrypted: encryptToken(accessToken),
    refresh_token_encrypted: encryptToken(refreshToken),
  }
}

/**
 * Decrypt both access and refresh tokens
 */
export function decryptTokens(
  accessTokenEncrypted: string,
  refreshTokenEncrypted: string
): {
  access_token: string
  refresh_token: string
} {
  return {
    access_token: decryptToken(accessTokenEncrypted),
    refresh_token: decryptToken(refreshTokenEncrypted),
  }
}
