import crypto from 'crypto'
import type { AccountingProvider } from '@/types'

interface OAuthConfig {
  clientId: string
  clientSecret: string
  authorizeUrl: string
  tokenUrl: string
  scopes: string[]
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function getOAuthConfig(provider: 'fortnox' | 'visma'): OAuthConfig {
  switch (provider) {
    case 'fortnox':
      return {
        clientId: process.env.FORTNOX_CLIENT_ID || '',
        clientSecret: process.env.FORTNOX_CLIENT_SECRET || '',
        authorizeUrl: 'https://apps.fortnox.se/oauth-v1/auth',
        tokenUrl: 'https://apps.fortnox.se/oauth-v1/token',
        scopes: [
          'bookkeeping', 'companyinformation', 'invoice', 'payment',
          'customer', 'supplier', 'supplierinvoice', 'article', 'price',
          'salary', 'offer', 'order', 'costcenter', 'project', 'currency',
          'settings', 'assets',
        ],
      }
    case 'visma':
      return {
        clientId: process.env.VISMA_CLIENT_ID || '',
        clientSecret: process.env.VISMA_CLIENT_SECRET || '',
        authorizeUrl: 'https://identity.vismaonline.com/connect/authorize',
        tokenUrl: 'https://identity.vismaonline.com/connect/token',
        scopes: ['ea:api', 'ea:sales', 'ea:purchase', 'ea:accounting', 'offline_access'],
      }
  }
}

export function buildAuthUrl(provider: 'fortnox' | 'visma', state: string): string {
  const config = getOAuthConfig(provider)
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/callback`

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    access_type: 'offline',
  })

  return `${config.authorizeUrl}?${params.toString()}`
}

export async function exchangeCodeForTokens(
  provider: 'fortnox' | 'visma',
  code: string
): Promise<TokenResponse> {
  const config = getOAuthConfig(provider)
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/callback`

  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`)
  }

  return response.json()
}

export async function refreshAccessToken(
  provider: 'fortnox' | 'visma',
  refreshToken: string
): Promise<TokenResponse> {
  const config = getOAuthConfig(provider)
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`)
  }

  return response.json()
}

export function isOAuthProvider(provider: AccountingProvider): provider is 'fortnox' | 'visma' {
  return provider === 'fortnox' || provider === 'visma'
}

/**
 * Build an auth URL with specific scopes (for re-auth / scope expansion).
 */
export function buildAuthUrlWithScopes(
  provider: 'fortnox' | 'visma',
  state: string,
  scopes: string[]
): string {
  const config = getOAuthConfig(provider)
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/callback`

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    access_type: 'offline',
  })

  return `${config.authorizeUrl}?${params.toString()}`
}
