import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireCompanyId } from '@/lib/company/context'

/**
 * POST /api/pending-operations/:id/reject
 *
 * Reject a pending operation. Marks it as rejected without executing.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  const { data: op, error: fetchError } = await supabase
    .from('pending_operations')
    .select('id, status')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (fetchError || !op) {
    return NextResponse.json({ error: 'Pending operation not found' }, { status: 404 })
  }

  if (op.status !== 'pending') {
    return NextResponse.json(
      { error: `Operation already ${op.status}` },
      { status: 409 }
    )
  }

  const { error: updateError } = await supabase
    .from('pending_operations')
    .update({
      status: 'rejected',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ data: { id, status: 'rejected' } })
}
