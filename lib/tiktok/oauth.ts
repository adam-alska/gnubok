import { TIKTOK_API_ENDPOINTS, TIKTOK_SCOPES, type TikTokTokens } from './types'
import { randomBytes, createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Create admin client for OAuth state management (server-side only)
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase configuration missing for OAuth state management')
  }

  return createClient(supabaseUrl, serviceRoleKey)
}

/**
 * Generate a random code verifier for PKCE
 */
function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Generate code challenge from verifier (SHA256 + base64url)
 */
function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/**
 * Generate OAuth state for CSRF protection and PKCE
 * Returns state and code_challenge for the authorization URL
 * Stores state in database to survive server restarts
 */
export async function generateOAuthState(userId: string): Promise<{ state: string; codeChallenge: string }> {
  const supabase = getAdminClient()

  // Clean up expired states
  await supabase
    .from('oauth_states')
    .delete()
    .lt('expires_at', new Date().toISOString())

  const state = randomBytes(32).toString('hex')
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  const { error } = await supabase
    .from('oauth_states')
    .insert({
      state,
      user_id: userId,
      code_verifier: codeVerifier,
      provider: 'tiktok',
    })

  if (error) {
    throw new Error(`Failed to store OAuth state: ${error.message}`)
  }

  return { state, codeChallenge }
}

/**
 * Validate and consume OAuth state
 * Returns the user ID and code verifier if valid, null otherwise
 * Reads from database to survive server restarts
 */
export async function validateOAuthState(state: string): Promise<{ userId: string; codeVerifier: string } | null> {
  const supabase = getAdminClient()

  // Fetch and delete in one operation (consume the state)
  const { data, error } = await supabase
    .from('oauth_states')
    .select('user_id, code_verifier, expires_at')
    .eq('state', state)
    .single()

  if (error || !data) {
    return null
  }

  // Check if state is expired
  if (new Date(data.expires_at) < new Date()) {
    // Delete expired state
    await supabase.from('oauth_states').delete().eq('state', state)
    return null
  }

  // Consume the state (one-time use)
  await supabase.from('oauth_states').delete().eq('state', state)

  return { userId: data.user_id, codeVerifier: data.code_verifier }
}

/**
 * Get the TikTok authorization URL with PKCE
 */
export function getAuthorizationUrl(redirectUri: string, state: string, codeChallenge: string): string {
  const clientKey = process.env.TIKTOK_CLIENT_KEY
  if (!clientKey) {
    throw new Error('TIKTOK_CLIENT_KEY environment variable is not set')
  }

  const params = new URLSearchParams({
    client_key: clientKey,
    scope: TIKTOK_SCOPES.join(','),
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  return `${TIKTOK_API_ENDPOINTS.authorize}?${params.toString()}`
}

/**
 * Exchange authorization code for tokens (with PKCE code_verifier)
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<TikTokTokens> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET

  if (!clientKey || !clientSecret) {
    throw new Error('TikTok client credentials are not configured')
  }

  const response = await fetch(TIKTOK_API_ENDPOINTS.token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  })

  const data = await response.json()

  if (data.error) {
    throw new Error(`TikTok OAuth error: ${data.error_description || data.error}`)
  }

  return data as TikTokTokens
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<TikTokTokens> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET

  if (!clientKey || !clientSecret) {
    throw new Error('TikTok client credentials are not configured')
  }

  const response = await fetch(TIKTOK_API_ENDPOINTS.token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const data = await response.json()

  if (data.error) {
    throw new Error(`TikTok token refresh error: ${data.error_description || data.error}`)
  }

  return data as TikTokTokens
}

/**
 * Revoke tokens (disconnect account)
 */
export async function revokeToken(accessToken: string): Promise<void> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET

  if (!clientKey || !clientSecret) {
    throw new Error('TikTok client credentials are not configured')
  }

  const response = await fetch(TIKTOK_API_ENDPOINTS.revokeToken, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      token: accessToken,
    }),
  })

  const data = await response.json()

  if (data.error && data.error.code !== 'ok') {
    // Log but don't throw - revocation is best-effort
    console.error('TikTok token revocation error:', data.error)
  }
}

/**
 * Calculate token expiration dates
 */
export function calculateTokenExpiration(tokens: TikTokTokens): {
  tokenExpiresAt: Date
  refreshTokenExpiresAt: Date
} {
  const now = new Date()

  return {
    tokenExpiresAt: new Date(now.getTime() + tokens.expires_in * 1000),
    refreshTokenExpiresAt: new Date(now.getTime() + tokens.refresh_expires_in * 1000),
  }
}

/**
 * Check if access token needs refresh (less than 1 hour remaining)
 */
export function shouldRefreshToken(tokenExpiresAt: Date): boolean {
  const now = new Date()
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)
  return tokenExpiresAt <= oneHourFromNow
}

/**
 * Check if refresh token is expired
 */
export function isRefreshTokenExpired(refreshTokenExpiresAt: Date): boolean {
  return new Date() >= refreshTokenExpiresAt
}
