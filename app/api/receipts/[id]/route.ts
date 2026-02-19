import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, UpdateReceiptInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

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

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

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

  const { success: patchRl, remaining: patchRem, reset: patchReset } = apiLimiter.check(user.id)
  if (!patchRl) return rateLimitResponse(patchReset)

  const raw = await request.json()
  const validation = validateBody(UpdateReceiptInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const { data, error } = await supabase
    .from('receipts')
    .update(body as Record<string, unknown>)
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

  const { success: delRl, remaining: delRem, reset: delReset } = apiLimiter.check(user.id)
  if (!delRl) return rateLimitResponse(delReset)

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
