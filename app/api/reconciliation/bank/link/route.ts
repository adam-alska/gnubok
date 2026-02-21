import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { manualLink } from '@/lib/reconciliation/bank-reconciliation'

ensureInitialized()

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { transaction_id, journal_entry_id } = body

  if (!transaction_id || !journal_entry_id) {
    return NextResponse.json(
      { error: 'transaction_id and journal_entry_id are required' },
      { status: 400 }
    )
  }

  const result = await manualLink(supabase, user.id, transaction_id, journal_entry_id)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ data: { success: true } })
}
