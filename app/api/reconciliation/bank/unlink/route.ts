import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unlinkReconciliation } from '@/lib/reconciliation/bank-reconciliation'
import { validateBody } from '@/lib/api/validate'
import { BankUnlinkSchema } from '@/lib/api/schemas'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const validation = await validateBody(request, BankUnlinkSchema)
  if (!validation.success) return validation.response
  const { transaction_id } = validation.data

  const result = await unlinkReconciliation(supabase, user.id, transaction_id)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ data: { success: true } })
}
