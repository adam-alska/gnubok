import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { validateBody } from '@/lib/api/validate'
import { SyncDataRequestSchema } from '@/lib/api/schemas'
import { syncFortnoxData } from '@/lib/connections/fortnox-sync-orchestrator'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params

  const result = await validateBody(request, SyncDataRequestSchema)
  if (!result.success) return result.response

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

  if (connection.status !== 'active') {
    return NextResponse.json(
      { error: 'Connection is not active' },
      { status: 400 }
    )
  }

  if (connection.provider !== 'fortnox') {
    return NextResponse.json(
      { error: 'Data sync is only supported for Fortnox' },
      { status: 400 }
    )
  }

  const adminClient = await createServiceClient()
  const syncResult = await syncFortnoxData(
    auth.supabase,
    adminClient,
    auth.user.id,
    connection.id,
    result.data.dataTypeIds,
    result.data.financialYear
  )

  return NextResponse.json({ data: syncResult })
}
