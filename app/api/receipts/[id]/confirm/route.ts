import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { ConfirmReceiptInput } from '@/types'

/**
 * POST /api/receipts/[id]/confirm
 * Confirm line item classifications and optionally link to a transaction
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify receipt ownership
  const { data: receipt, error: fetchError } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !receipt) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  }

  const body: ConfirmReceiptInput = await request.json()

  // Update line items with classifications
  if (body.line_items && body.line_items.length > 0) {
    for (const item of body.line_items) {
      const { error: updateError } = await supabase
        .from('receipt_line_items')
        .update({
          is_business: item.is_business,
          category: item.category || null,
          bas_account: item.bas_account || null,
        })
        .eq('id', item.id)
        .eq('receipt_id', id)

      if (updateError) {
        console.error('Line item update error:', updateError)
      }
    }
  }

  // Build receipt update
  const receiptUpdate: Record<string, unknown> = {
    status: 'confirmed',
  }

  // Add restaurant representation data if provided
  if (body.representation_persons !== undefined) {
    receiptUpdate.representation_persons = body.representation_persons
  }
  if (body.representation_purpose !== undefined) {
    receiptUpdate.representation_purpose = body.representation_purpose
  }

  // Link to transaction if provided
  if (body.matched_transaction_id) {
    // Verify transaction ownership
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('id')
      .eq('id', body.matched_transaction_id)
      .eq('user_id', user.id)
      .single()

    if (!txError && transaction) {
      receiptUpdate.matched_transaction_id = body.matched_transaction_id

      // Also update the transaction with the receipt link
      await supabase
        .from('transactions')
        .update({ receipt_id: id })
        .eq('id', body.matched_transaction_id)
    }
  }

  // Update the receipt
  const { data: updatedReceipt, error: updateError } = await supabase
    .from('receipts')
    .update(receiptUpdate)
    .eq('id', id)
    .select(`
      *,
      line_items:receipt_line_items(*)
    `)
    .single()

  if (updateError) {
    console.error('Receipt update error:', updateError)
    return NextResponse.json({ error: 'Failed to update receipt' }, { status: 500 })
  }

  return NextResponse.json({ data: updatedReceipt })
}
