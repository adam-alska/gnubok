import { NextResponse } from 'next/server'
import { decryptAuthCode, verifyPkce } from '@/lib/auth/oauth-codes'

/**
 * OAuth 2.0 Token Endpoint.
 * Exchanges an authorization code for an API key (access token).
 * Verifies PKCE before issuing the token.
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

  // Decrypt the auth code (stateless — no DB lookup needed)
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

  // Verify PKCE
  if (codeVerifier) {
    if (!verifyPkce(codeVerifier, payload.codeChallenge, payload.codeChallengeMethod)) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'PKCE verification failed' },
        { status: 400 }
      )
    }
  } else if (payload.codeChallenge) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'code_verifier required for PKCE' },
      { status: 400 }
    )
  }

  return NextResponse.json({
    access_token: payload.apiKey,
    token_type: 'Bearer',
    scope: 'mcp',
  })
}
