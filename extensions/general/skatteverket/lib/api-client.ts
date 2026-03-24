import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { refreshAccessToken } from './oauth'
import { getTokens, storeTokens } from './token-store'
import type { SkatteverketTokens } from '../types'

/**
 * Skatteverket API client.
 *
 * Handles:
 * - Automatic token refresh (transparent to callers)
 * - Required API gateway headers
 * - Rate limiting (4 req/sec per consumer)
 * - Correlation ID generation
 */

const DEFAULT_API_BASE_URL = 'https://api.test.skatteverket.se/momsdeklaration/v1'
const MAX_REFRESH_COUNT = 10
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000 // Refresh 5 min before expiry

// Simple in-memory token bucket for 4 req/sec rate limit
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL_MS = 250 // 1000ms / 4 = 250ms

function getApiBaseUrl(): string {
  return process.env.SKATTEVERKET_API_BASE_URL || DEFAULT_API_BASE_URL
}

function getApiGwClientId(): string {
  const id = process.env.SKATTEVERKET_APIGW_CLIENT_ID
  if (!id) throw new Error('SKATTEVERKET_APIGW_CLIENT_ID is required')
  return id
}

function getApiGwClientSecret(): string {
  const secret = process.env.SKATTEVERKET_APIGW_CLIENT_SECRET
  if (!secret) throw new Error('SKATTEVERKET_APIGW_CLIENT_SECRET is required')
  return secret
}

/**
 * Ensure rate limit compliance (4 req/sec).
 * Delays if the last request was too recent.
 */
async function enforceRateLimit(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed))
  }
  lastRequestTime = Date.now()
}

/**
 * Get a valid access token, refreshing if needed.
 * Throws if no tokens exist or refresh is exhausted.
 */
async function getValidToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const tokens = await getTokens(supabase, userId)
  if (!tokens) {
    throw new SkatteverketAuthError(
      'Inte ansluten till Skatteverket. Anslut med BankID först.',
      'NOT_CONNECTED'
    )
  }

  // Token still valid (with 5-min margin)
  if (tokens.expires_at > Date.now() + TOKEN_REFRESH_MARGIN_MS) {
    return tokens.access_token
  }

  // Need refresh
  if (!tokens.refresh_token) {
    throw new SkatteverketAuthError(
      'Sessionen har gått ut. Logga in med BankID igen.',
      'SESSION_EXPIRED'
    )
  }

  if (tokens.refresh_count >= MAX_REFRESH_COUNT) {
    throw new SkatteverketAuthError(
      'Maximalt antal förnyelser uppnått. Logga in med BankID igen.',
      'REFRESH_EXHAUSTED'
    )
  }

  // Refresh — returns NEW refresh_token that must be stored
  const refreshed = await refreshAccessToken(tokens.refresh_token)
  const updatedTokens: SkatteverketTokens = {
    ...refreshed,
    refresh_count: tokens.refresh_count + 1,
    scope: tokens.scope,
  }
  await storeTokens(supabase, userId, updatedTokens)

  return updatedTokens.access_token
}

/**
 * Make an authenticated request to the Skatteverket API.
 *
 * Automatically handles:
 * - Token refresh if expired
 * - Required headers (Client_Id, Client_Secret, correlation ID)
 * - Rate limiting
 */
export async function skvRequest(
  supabase: SupabaseClient,
  userId: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const accessToken = await getValidToken(supabase, userId)

  await enforceRateLimit()

  const url = `${getApiBaseUrl()}${path}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Client_Id': getApiGwClientId(),
    'Client_Secret': getApiGwClientSecret(),
    'skv_client_correlation_id': crypto.randomUUID(),
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // Handle Skatteverket-specific auth errors
  if (response.status === 403) {
    const text = await response.text()
    // Behörighet saknas — user is authenticated but not authorized for this company
    if (text.includes('Behörighet') || text.includes('behörighet')) {
      throw new SkatteverketAuthError(
        'Du har inte behörighet att agera för detta företag hos Skatteverket. ' +
        'Kontrollera att du är registrerad som firmatecknare eller deklarationsombud.',
        'BEHORIGHET_SAKNAS'
      )
    }
    throw new SkatteverketAuthError(
      `Åtkomst nekad av Skatteverket (403): ${text}`,
      'ACCESS_DENIED'
    )
  }

  if (response.status === 401) {
    throw new SkatteverketAuthError(
      'Sessionen har gått ut. Logga in med BankID igen.',
      'SESSION_EXPIRED'
    )
  }

  return response
}

/**
 * Structured error for Skatteverket auth/access issues.
 * The `code` field helps the frontend show appropriate UI.
 */
export class SkatteverketAuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_CONNECTED'
      | 'SESSION_EXPIRED'
      | 'REFRESH_EXHAUSTED'
      | 'BEHORIGHET_SAKNAS'
      | 'ACCESS_DENIED'
  ) {
    super(message)
    this.name = 'SkatteverketAuthError'
  }
}
