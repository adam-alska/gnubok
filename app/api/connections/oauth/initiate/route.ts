import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { validateBody } from '@/lib/api/validate'
import { InitiateOAuthSchema } from '@/lib/api/schemas'
import { generateCsrfToken, buildAuthUrl } from '@/lib/connections/oauth'

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const result = await validateBody(request, InitiateOAuthSchema)
  if (!result.success) return result.response

  const { provider } = result.data
  const userId = auth.user.id

  // Check for existing active connection
  const { data: existing } = await auth.supabase
    .from('provider_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .in('status', ['active'])
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: 'An active connection already exists for this provider' },
      { status: 409 }
    )
  }

  // Clean up stale pending/error connections
  await auth.supabase
    .from('provider_connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider)
    .in('status', ['pending', 'error'])

  // Create pending connection
  const { data: connection, error: connError } = await auth.supabase
    .from('provider_connections')
    .insert({
      user_id: userId,
      provider,
      status: 'pending',
    })
    .select()
    .single()

  if (connError || !connection) {
    console.error('[connections/oauth/initiate] Failed to create connection:', connError)
    return NextResponse.json(
      { error: connError?.message || 'Failed to create connection' },
      { status: 500 }
    )
  }

  // Generate CSRF token and store state
  const csrfToken = generateCsrfToken()
  const state = `${provider}:${connection.id}:${csrfToken}`

  const adminClient = await createServiceClient()
  const { error: stateError } = await adminClient
    .from('provider_oauth_states')
    .insert({
      user_id: userId,
      provider,
      csrf_token: csrfToken,
      connection_id: connection.id,
    })

  if (stateError) {
    console.error('[connections/oauth/initiate] Failed to create OAuth state:', stateError)
    return NextResponse.json(
      { error: 'Failed to create OAuth state' },
      { status: 500 }
    )
  }

  const authUrl = buildAuthUrl(provider, state)

  return NextResponse.json({
    data: { authUrl, connectionId: connection.id },
  })
}
