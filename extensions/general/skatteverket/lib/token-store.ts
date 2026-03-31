import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SkatteverketTokens } from '../types'

/**
 * Encrypted token storage for Skatteverket OAuth2 tokens.
 *
 * Uses AES-256-GCM with a dedicated encryption key (not the Supabase service
 * role key) to encrypt tokens at rest in the skatteverket_tokens table.
 *
 * Pattern mirrors lib/auth/oauth-codes.ts but adapted for persistent storage.
 */

const ALGORITHM = 'aes-256-gcm'

function getEncryptionKey(): Buffer {
  const key = process.env.SKATTEVERKET_TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('SKATTEVERKET_TOKEN_ENCRYPTION_KEY is required')
  return crypto.createHash('sha256').update(key).digest()
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

function decrypt(ciphertext: string): string {
  const key = getEncryptionKey()
  const combined = Buffer.from(ciphertext, 'base64url')
  const iv = combined.subarray(0, 12)
  const tag = combined.subarray(12, 28)
  const encrypted = combined.subarray(28)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

/**
 * Store (upsert) Skatteverket tokens for a user.
 * Both access_token and refresh_token are encrypted at rest.
 */
export async function storeTokens(
  supabase: SupabaseClient,
  userId: string,
  tokens: SkatteverketTokens
): Promise<void> {
  const encryptedAccess = encrypt(tokens.access_token)
  const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null

  const { error } = await supabase
    .from('skatteverket_tokens')
    .upsert(
      {
        user_id: userId,
        access_token: encryptedAccess,
        refresh_token: encryptedRefresh,
        expires_at: new Date(tokens.expires_at).toISOString(),
        refresh_count: tokens.refresh_count,
        scope: tokens.scope,
      },
      { onConflict: 'user_id' }
    )

  if (error) throw new Error(`Failed to store tokens: ${error.message}`)
}

/**
 * Retrieve and decrypt Skatteverket tokens for a user.
 * Returns null if no tokens are stored.
 */
export async function getTokens(
  supabase: SupabaseClient,
  userId: string
): Promise<SkatteverketTokens | null> {
  const { data, error } = await supabase
    .from('skatteverket_tokens')
    .select('access_token, refresh_token, expires_at, refresh_count, scope')
    .eq('company_id', userId)
    .single()

  if (error || !data) return null

  try {
    return {
      access_token: decrypt(data.access_token),
      refresh_token: data.refresh_token ? decrypt(data.refresh_token) : null,
      expires_at: new Date(data.expires_at).getTime(),
      refresh_count: data.refresh_count ?? 0,
      scope: data.scope,
    }
  } catch {
    // Decryption failed — key may have rotated, tokens are invalid
    return null
  }
}

/**
 * Delete stored tokens (disconnect from Skatteverket).
 */
export async function deleteTokens(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase
    .from('skatteverket_tokens')
    .delete()
    .eq('company_id', userId)
}
