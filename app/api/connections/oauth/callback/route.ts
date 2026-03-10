import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { exchangeCodeForTokens, getOAuthConfig } from '@/lib/connections/oauth'
import { fetchFortnoxCompanyInfo } from '@/lib/connections/fortnox-api'
import type { AccountingProvider } from '@/types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

function redirectWithError(error: string) {
  return NextResponse.redirect(
    `${appUrl}/import?error=${encodeURIComponent(error)}`
  )
}

function redirectWithSuccess(provider: string) {
  return NextResponse.redirect(
    `${appUrl}/import?connected=${provider}`
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return redirectWithError(error)
  }

  if (!code || !state) {
    return redirectWithError('Missing code or state parameter')
  }

  // Parse state: provider:connectionId:csrfToken
  const parts = state.split(':')
  if (parts.length !== 3) {
    return redirectWithError('Invalid state format')
  }

  const [provider, connectionId, csrfToken] = parts

  if (provider !== 'fortnox' && provider !== 'visma') {
    return redirectWithError('Invalid provider in state')
  }

  // Use service client for token/state operations
  const cookieStore = await cookies()
  const adminClient = createServerClient(url, serviceKey, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Ignore in Server Components
        }
      },
    },
  })

  // Validate CSRF token
  const { data: oauthState, error: stateError } = await adminClient
    .from('provider_oauth_states')
    .select('*')
    .eq('connection_id', connectionId)
    .eq('csrf_token', csrfToken)
    .single()

  if (stateError || !oauthState) {
    return redirectWithError('Invalid or expired OAuth state')
  }

  // Check expiry
  if (new Date(oauthState.expires_at) < new Date()) {
    await adminClient.from('provider_oauth_states').delete().eq('id', oauthState.id)
    return redirectWithError('OAuth state has expired')
  }

  // Clean up state
  await adminClient.from('provider_oauth_states').delete().eq('id', oauthState.id)

  // Exchange code for tokens
  let tokenResponse
  try {
    tokenResponse = await exchangeCodeForTokens(provider as 'fortnox' | 'visma', code)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token exchange failed'
    await adminClient
      .from('provider_connections')
      .update({ status: 'error', error_message: message })
      .eq('id', connectionId)
    return redirectWithError(message)
  }

  // Store tokens (upsert to handle re-auth / scope expansion)
  const tokenExpiresAt = tokenResponse.expires_in
    ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
    : null

  // Determine granted scopes from the OAuth config (Fortnox doesn't return scopes in token response)
  const oauthConfig = getOAuthConfig(provider as 'fortnox' | 'visma')
  const grantedScopes = oauthConfig.scopes

  // Try with granted_scopes first, fall back without if column doesn't exist yet
  let tokenError
  const { error: err1 } = await adminClient
    .from('provider_connection_tokens')
    .upsert(
      {
        connection_id: connectionId,
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token ?? null,
        token_expires_at: tokenExpiresAt,
        granted_scopes: grantedScopes,
      },
      { onConflict: 'connection_id' }
    )

  if (err1) {
    // Retry without granted_scopes (column may not exist if migration not applied)
    const { error: err2 } = await adminClient
      .from('provider_connection_tokens')
      .upsert(
        {
          connection_id: connectionId,
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token ?? null,
          token_expires_at: tokenExpiresAt,
        },
        { onConflict: 'connection_id' }
      )
    tokenError = err2
  }

  if (tokenError) {
    console.error('[oauth/callback] Failed to store tokens:', tokenError)
    await adminClient
      .from('provider_connections')
      .update({ status: 'error', error_message: tokenError.message || 'Failed to store tokens' })
      .eq('id', connectionId)
    return redirectWithError('Failed to store tokens')
  }

  // Activate connection
  await adminClient
    .from('provider_connections')
    .update({
      status: 'active',
      connected_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', connectionId)

  // Fetch company info (Fortnox, non-blocking)
  if (provider === 'fortnox') {
    fetchFortnoxCompanyInfo(tokenResponse.access_token)
      .then(async (info) => {
        if (info) {
          await adminClient
            .from('provider_connections')
            .update({ provider_company_name: info.CompanyName })
            .eq('id', connectionId)
        }
      })
      .catch(() => {})
  }

  return redirectWithSuccess(provider as AccountingProvider)
}
