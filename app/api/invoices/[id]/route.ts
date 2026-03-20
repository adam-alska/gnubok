import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * DELETE /api/invoices/[id]
 *
 * Permanently deletes a draft invoice and its items.
 * Only invoices with status 'draft' can be deleted — committed invoices
 * are immutable per BFL and must be reversed via credit note instead.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch invoice to verify ownership and status
  const { data: invoice, error: fetchError } = await supabase
    .from('invoices')
    .select('id, status, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  if (invoice.status !== 'draft') {
    return NextResponse.json(
      { error: 'Endast utkast kan tas bort. Bokförda fakturor måste krediteras istället.' },
      { status: 400 }
    )
  }

  // Delete items first (FK constraint), then the invoice
  const { error: itemsError } = await supabase
    .from('invoice_items')
    .delete()
    .eq('invoice_id', id)

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  const { error: deleteError } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ data: { deleted: true } })
}
