import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { validateBody } from '@/lib/api/validate'
import { ConnectProviderSchema } from '@/lib/api/schemas'
import { exchangeBrioxToken, getBjornLundenToken } from '@/lib/connections/token-exchange'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { data, error } = await auth.supabase
    .from('provider_connections')
    .select('*')
    .eq('user_id', auth.user.id)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const result = await validateBody(request, ConnectProviderSchema)
  if (!result.success) return result.response

  const body = result.data
  const userId = auth.user.id

  // Check for existing active connection
  const { data: existing } = await auth.supabase
    .from('provider_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', body.provider)
    .neq('status', 'revoked')
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: 'An active connection already exists for this provider' },
      { status: 409 }
    )
  }

  // Exchange token server-side
  let accessToken: string
  let tokenExpiresAt: string | null = null
  let extraData: Record<string, unknown> = {}

  try {
    switch (body.provider) {
      case 'briox': {
        const tokenResult = await exchangeBrioxToken(body.application_token)
        accessToken = tokenResult.access_token
        if (tokenResult.expires_in) {
          tokenExpiresAt = new Date(Date.now() + tokenResult.expires_in * 1000).toISOString()
        }
        break
      }
      case 'bokio': {
        // Bokio uses static API key — store directly
        accessToken = body.api_key
        extraData = { company_id: body.company_id }
        break
      }
      case 'bjorn_lunden': {
        const tokenResult = await getBjornLundenToken()
        accessToken = tokenResult.access_token
        if (tokenResult.expires_in) {
          tokenExpiresAt = new Date(Date.now() + tokenResult.expires_in * 1000).toISOString()
        }
        extraData = { company_key: body.company_key }
        break
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token exchange failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  // Create connection
  const { data: connection, error: connError } = await auth.supabase
    .from('provider_connections')
    .insert({
      user_id: userId,
      provider: body.provider,
      status: 'active',
      connected_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (connError || !connection) {
    return NextResponse.json(
      { error: connError?.message || 'Failed to create connection' },
      { status: 500 }
    )
  }

  // Store tokens via service client (bypasses RLS)
  const adminClient = await createServiceClient()
  const { error: tokenError } = await adminClient
    .from('provider_connection_tokens')
    .insert({
      connection_id: connection.id,
      access_token: accessToken,
      token_expires_at: tokenExpiresAt,
      provider_company_id: body.provider === 'bokio' ? body.company_id : null,
      extra_data: extraData,
    })

  if (tokenError) {
    // Clean up connection on token storage failure
    await auth.supabase
      .from('provider_connections')
      .delete()
      .eq('id', connection.id)
    return NextResponse.json({ error: 'Failed to store credentials' }, { status: 500 })
  }

  return NextResponse.json({ data: connection }, { status: 201 })
}
