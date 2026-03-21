import { NextResponse } from 'next/server'
import crypto from 'crypto'

/**
 * RFC 7591 — Dynamic Client Registration.
 * Claude Desktop registers itself as an OAuth client before starting the auth flow.
 * We accept any registration and return a client_id.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const clientId = crypto.randomUUID()

  return NextResponse.json({
    client_id: clientId,
    client_name: (body.client_name as string) || 'MCP Client',
    redirect_uris: body.redirect_uris || [],
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  }, { status: 201 })
}
