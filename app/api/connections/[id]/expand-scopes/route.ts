import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { generateCsrfToken, buildAuthUrlWithScopes, getOAuthConfig } from '@/lib/connections/oauth'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params

  // Verify ownership and active status
  const { data: connection, error } = await auth.supabase
    .from('provider_connections')
    .select('id, provider, status')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single()

  if (error || !connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  if (connection.provider !== 'fortnox') {
    return NextResponse.json(
      { error: 'Scope expansion is only supported for Fortnox' },
      { status: 400 }
    )
  }

  // Create OAuth state for CSRF protection
  const adminClient = await createServiceClient()
  const csrfToken = generateCsrfToken()

  const { error: stateError } = await adminClient
    .from('provider_oauth_states')
    .insert({
      user_id: auth.user.id,
      provider: 'fortnox',
      csrf_token: csrfToken,
      connection_id: id,
    })

  if (stateError) {
    return NextResponse.json(
      { error: 'Failed to initiate re-authentication' },
      { status: 500 }
    )
  }

  // Build auth URL with all scopes
  const state = `fortnox:${id}:${csrfToken}`
  const config = getOAuthConfig('fortnox')
  const authUrl = buildAuthUrlWithScopes('fortnox', state, config.scopes)

  return NextResponse.json({ data: { authUrl } })
}
