import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/receipts/[id]
 * Get a single receipt with line items
 */
export async function GET(
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

  const { data, error } = await supabase
    .from('receipts')
    .select(`
      *,
      line_items:receipt_line_items(*),
      matched_transaction:transactions(*)
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * PATCH /api/receipts/[id]
 * Update a receipt
 */
export async function PATCH(
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

  const body = await request.json()

  // Allowed update fields
  const allowedFields = [
    'merchant_name',
    'receipt_date',
    'receipt_time',
    'total_amount',
    'currency',
    'vat_amount',
    'is_restaurant',
    'is_systembolaget',
    'is_foreign_merchant',
    'representation_persons',
    'representation_purpose',
    'status',
  ]

  const updates: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field]
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('receipts')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select(`
      *,
      line_items:receipt_line_items(*)
    `)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * DELETE /api/receipts/[id]
 * Delete a receipt and its line items
 */
export async function DELETE(
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

  // Get receipt to find image URL for cleanup
  const { data: receipt } = await supabase
    .from('receipts')
    .select('image_url, matched_transaction_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!receipt) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  }

  // Unlink from transaction if matched
  if (receipt.matched_transaction_id) {
    await supabase
      .from('transactions')
      .update({ receipt_id: null })
      .eq('id', receipt.matched_transaction_id)
  }

  // Delete receipt (line items are cascade deleted)
  const { error } = await supabase
    .from('receipts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Optionally delete image from storage
  if (receipt.image_url) {
    try {
      const urlParts = receipt.image_url.split('/receipts/')
      if (urlParts[1]) {
        await supabase.storage.from('receipts').remove([urlParts[1]])
      }
    } catch {
      // Ignore storage cleanup errors
    }
  }

  return NextResponse.json({ success: true })
}
