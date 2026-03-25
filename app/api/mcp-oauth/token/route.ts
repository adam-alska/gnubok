import { NextResponse } from 'next/server'
import { decryptAuthCode, verifyPkce, hashAuthCode } from '@/lib/auth/oauth-codes'
import { generateApiKey, createServiceClientNoCookies, ALL_SCOPES } from '@/lib/auth/api-keys'

/**
 * OAuth 2.0 Token Endpoint.
 *
 * Exchanges an authorization code for an API key (access token).
 * 1. Decrypts the stateless auth code
 * 2. Checks for replay (single-use enforcement per OAuth 2.1 §4.1.2)
 * 3. Verifies PKCE (S256 only)
 * 4. Creates the API key (deferred from /authorize to prevent orphaned keys)
 * 5. Returns the key as a bearer token
 */
export async function POST(request: Request) {
  let params: URLSearchParams

  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text()
    params = new URLSearchParams(text)
  } else if (contentType.includes('application/json')) {
    const json = await request.json()
    params = new URLSearchParams(json as Record<string, string>)
  } else {
    return NextResponse.json({ error: 'unsupported_content_type' }, { status: 400 })
  }

  const grantType = params.get('grant_type')
  const code = params.get('code')
  const codeVerifier = params.get('code_verifier')
  const redirectUri = params.get('redirect_uri')

  if (grantType !== 'authorization_code') {
    return NextResponse.json(
      { error: 'unsupported_grant_type', error_description: 'Only authorization_code is supported' },
      { status: 400 }
    )
  }

  if (!code) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing code parameter' },
      { status: 400 }
    )
  }

  // Decrypt the auth code
  const payload = decryptAuthCode(code)
  if (!payload) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' },
      { status: 400 }
    )
  }

  // Verify redirect_uri matches
  if (redirectUri && redirectUri !== payload.redirectUri) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'redirect_uri mismatch' },
      { status: 400 }
    )
  }

  // Verify PKCE (S256 only)
  if (!codeVerifier) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'code_verifier is required' },
      { status: 400 }
    )
  }

  if (!verifyPkce(codeVerifier, payload.codeChallenge)) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'PKCE verification failed' },
      { status: 400 }
    )
  }

  // Single-use enforcement: check and mark code as used (atomically via unique constraint)
  const codeHash = hashAuthCode(code)
  const supabase = createServiceClientNoCookies()

  const { error: replayError } = await supabase
    .from('oauth_used_codes')
    .insert({ code_hash: codeHash })

  if (replayError) {
    // Unique constraint violation = code already used
    return NextResponse.json(
      { error: 'invalid_grant', error_description: 'Authorization code already used' },
      { status: 400 }
    )
  }

  // Clean up expired codes (non-blocking, best-effort)
  supabase
    .from('oauth_used_codes')
    .delete()
    .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .then(() => {})

  // Create the API key now (after PKCE verification — prevents orphaned keys)
  const { key, hash, prefix } = generateApiKey()

  const { error: insertError } = await supabase
    .from('api_keys')
    .insert({
      user_id: payload.userId,
      key_hash: hash,
      key_prefix: prefix,
      name: 'MCP-klient (OAuth)',
      scopes: ALL_SCOPES,
    })

  if (insertError) {
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to create API key' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    access_token: key,
    token_type: 'Bearer',
    scope: 'mcp',
  })
}
