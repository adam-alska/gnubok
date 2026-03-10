import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { FORTNOX_DATA_TYPES } from '@/lib/connections/fortnox-data-types'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params

  // Verify ownership
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
      { error: 'Data types are only available for Fortnox' },
      { status: 400 }
    )
  }

  // Get granted scopes from tokens
  const adminClient = await createServiceClient()
  const { data: tokenData } = await adminClient
    .from('provider_connection_tokens')
    .select('granted_scopes')
    .eq('connection_id', id)
    .single()

  const grantedScopes: string[] = tokenData?.granted_scopes || []

  const dataTypes = FORTNOX_DATA_TYPES.map((dt) => ({
    ...dt,
    scopeAvailable: grantedScopes.length === 0 || grantedScopes.includes(dt.requiredScope),
  }))

  return NextResponse.json({ data: dataTypes })
}
