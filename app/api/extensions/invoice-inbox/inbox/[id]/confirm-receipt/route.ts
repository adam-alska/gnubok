import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { eventBus } from '@/lib/events/bus'

ensureInitialized()

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Fetch inbox item
  const { data: inboxItem, error: findError } = await supabase
    .from('invoice_inbox_items')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (findError || !inboxItem) {
    return NextResponse.json({ error: 'Inbox item not found' }, { status: 404 })
  }

  if (inboxItem.document_type !== 'receipt') {
    return NextResponse.json({ error: 'Inbox item is not a receipt' }, { status: 400 })
  }

  if (!inboxItem.linked_receipt_id) {
    return NextResponse.json({ error: 'No linked receipt found' }, { status: 400 })
  }

  const body = await request.json()
  const {
    line_items,
    matched_transaction_id,
    representation_persons,
    representation_purpose,
    representation_business_connection,
  } = body

  // Update receipt line items (business/private classification)
  if (Array.isArray(line_items)) {
    for (const item of line_items) {
      if (!item.id) continue
      await supabase
        .from('receipt_line_items')
        .update({
          is_business: item.is_business,
          ...(item.category ? { category: item.category } : {}),
          ...(item.bas_account ? { bas_account: item.bas_account } : {}),
        })
        .eq('id', item.id)
        .eq('receipt_id', inboxItem.linked_receipt_id)
    }
  }

  // Calculate business/private totals
  const { data: updatedLineItems } = await supabase
    .from('receipt_line_items')
    .select('*')
    .eq('receipt_id', inboxItem.linked_receipt_id)

  let businessTotal = 0
  let privateTotal = 0
  if (updatedLineItems) {
    for (const li of updatedLineItems) {
      if (li.is_business === true) {
        businessTotal += li.line_total
      } else if (li.is_business === false) {
        privateTotal += li.line_total
      }
    }
  }
  businessTotal = Math.round(businessTotal * 100) / 100
  privateTotal = Math.round(privateTotal * 100) / 100

  // Update receipt with match and representation data
  const receiptUpdate: Record<string, unknown> = {
    status: 'confirmed',
  }

  if (matched_transaction_id) {
    receiptUpdate.matched_transaction_id = matched_transaction_id
  }
  if (representation_persons != null) {
    receiptUpdate.representation_persons = representation_persons
  }
  if (representation_purpose) {
    receiptUpdate.representation_purpose = representation_purpose
  }
  if (representation_business_connection) {
    receiptUpdate.representation_business_connection = representation_business_connection
  }

  await supabase
    .from('receipts')
    .update(receiptUpdate)
    .eq('id', inboxItem.linked_receipt_id)

  // Link transaction to receipt if provided
  if (matched_transaction_id) {
    await supabase
      .from('transactions')
      .update({ receipt_id: inboxItem.linked_receipt_id })
      .eq('id', matched_transaction_id)
      .eq('user_id', user.id)
  }

  // Update inbox item status
  await supabase
    .from('invoice_inbox_items')
    .update({ status: 'confirmed' })
    .eq('id', id)

  // Emit event (non-blocking)
  try {
    const { data: receipt } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', inboxItem.linked_receipt_id)
      .single()

    if (receipt) {
      await eventBus.emit({
        type: 'receipt.confirmed',
        payload: {
          receipt,
          businessTotal,
          privateTotal,
          userId: user.id,
        },
      })
    }
  } catch {
    // Non-blocking
  }

  return NextResponse.json({ data: { confirmed: true, businessTotal, privateTotal } })
}
