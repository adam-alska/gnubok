import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unlinkReconciliation } from '@/lib/reconciliation/bank-reconciliation'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { transaction_id } = body

  if (!transaction_id) {
    return NextResponse.json(
      { error: 'transaction_id is required' },
      { status: 400 }
    )
  }

  const result = await unlinkReconciliation(supabase, user.id, transaction_id)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ data: { success: true } })
}
