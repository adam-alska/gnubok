import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireCompanyId } from '@/lib/company/context'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  // Fetch the transaction with ownership check
  const { data: transaction, error: fetchError } = await supabase
    .from('transactions')
    .select('id, journal_entry_id')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (fetchError || !transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  // Guard: only unbooked transactions can be deleted
  if (transaction.journal_entry_id) {
    return NextResponse.json(
      { error: 'Cannot delete a booked transaction. Use reversal (storno) instead.' },
      { status: 409 }
    )
  }

  const { error: deleteError } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
