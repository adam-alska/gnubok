import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const { id } = await params

  // Verify ownership
  const { data: connection, error } = await auth.supabase
    .from('provider_connections')
    .select('id, user_id')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single()

  if (error || !connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  // Delete tokens via service client
  const adminClient = await createServiceClient()
  await adminClient
    .from('provider_connection_tokens')
    .delete()
    .eq('connection_id', id)

  // Set status to revoked
  await auth.supabase
    .from('provider_connections')
    .update({ status: 'revoked' })
    .eq('id', id)

  return NextResponse.json({ data: { success: true } })
}
