import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { fetchFortnoxFinancialYears } from '@/lib/connections/fortnox-api'
import { refreshAccessToken } from '@/lib/connections/oauth'

export async function GET(
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
    return NextResponse.json({ error: 'Only supported for Fortnox' }, { status: 400 })
  }

  // Get tokens
  const adminClient = await createServiceClient()
  const { data: tokenData } = await adminClient
    .from('provider_connection_tokens')
    .select('*')
    .eq('connection_id', id)
    .single()

  if (!tokenData) {
    return NextResponse.json({ error: 'No tokens found' }, { status: 500 })
  }

  let accessToken = tokenData.access_token

  // Refresh if expired
  if (tokenData.token_expires_at && tokenData.refresh_token) {
    const expiresAt = new Date(tokenData.token_expires_at)
    const bufferMs = 5 * 60 * 1000
    if (expiresAt.getTime() - bufferMs < Date.now()) {
      try {
        const refreshed = await refreshAccessToken('fortnox', tokenData.refresh_token)
        accessToken = refreshed.access_token
        await adminClient
          .from('provider_connection_tokens')
          .update({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token ?? tokenData.refresh_token,
            token_expires_at: refreshed.expires_in
              ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
              : tokenData.token_expires_at,
          })
          .eq('connection_id', id)
      } catch {
        return NextResponse.json({ error: 'Token refresh failed' }, { status: 500 })
      }
    }
  }

  const years = await fetchFortnoxFinancialYears(accessToken)

  return NextResponse.json({
    data: years.map((y) => ({
      id: y.Id,
      fromDate: y.FromDate,
      toDate: y.ToDate,
    })),
  })
}
