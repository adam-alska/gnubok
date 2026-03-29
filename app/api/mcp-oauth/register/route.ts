import { NextResponse } from 'next/server'
import crypto from 'crypto'

// Allowed redirect URI patterns (must match CLAUDE.md allowlist)
const ALLOWED_REDIRECT_PATTERNS = [
  /^https:\/\/claude\.ai\/api\//,
  /^https:\/\/claude\.com\/api\//,
  /^http:\/\/localhost(:\d+)?(\/|$)/,
  /^http:\/\/127\.0\.0\.1(:\d+)?(\/|$)/,
]

function isRedirectUriAllowed(uri: string): boolean {
  return ALLOWED_REDIRECT_PATTERNS.some(pattern => pattern.test(uri))
}

/**
 * RFC 7591 — Dynamic Client Registration.
 * Claude Desktop registers itself as an OAuth client before starting the auth flow.
 * Validates redirect_uris against the allowlist before accepting registration.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  // Validate redirect_uris against allowlist
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : []
  for (const uri of redirectUris) {
    if (typeof uri !== 'string' || !isRedirectUriAllowed(uri)) {
      return NextResponse.json(
        { error: 'invalid_redirect_uri', error_description: `Redirect URI not allowed: ${uri}` },
        { status: 400 }
      )
    }
  }

  const clientId = crypto.randomUUID()

  return NextResponse.json({
    client_id: clientId,
    client_name: (body.client_name as string) || 'MCP Client',
    redirect_uris: redirectUris,
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }, { status: 201 })
}
