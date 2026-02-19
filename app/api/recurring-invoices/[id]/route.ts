import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, UpdateRecurringInvoiceInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { data, error } = await supabase
    .from('recurring_invoices')
    .select('*, customer:customers(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Återkommande faktura hittades inte' }, { status: 404 })
  }

  return NextResponse.json({ data })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  const body = await request.json()
  const validation = validateBody(UpdateRecurringInvoiceInputSchema, body)
  if (!validation.success) return validation.response
  const input = validation.data

  // Build update object, only including provided fields
  const updates: Record<string, unknown> = {}
  if (input.template_name !== undefined) updates.template_name = input.template_name
  if (input.description !== undefined) updates.description = input.description
  if (input.frequency !== undefined) updates.frequency = input.frequency
  if (input.interval_count !== undefined) updates.interval_count = input.interval_count
  if (input.end_date !== undefined) updates.end_date = input.end_date
  if (input.is_active !== undefined) updates.is_active = input.is_active
  if (input.items !== undefined) updates.items = input.items
  if (input.currency !== undefined) updates.currency = input.currency
  if (input.your_reference !== undefined) updates.your_reference = input.your_reference
  if (input.our_reference !== undefined) updates.our_reference = input.our_reference
  if (input.notes !== undefined) updates.notes = input.notes
  if (input.payment_terms_days !== undefined) updates.payment_terms_days = input.payment_terms_days

  const { data, error } = await supabase
    .from('recurring_invoices')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*, customer:customers(id, name, email)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Återkommande faktura hittades inte' }, { status: 404 })
  }

  return NextResponse.json({ data })
}

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

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { error } = await supabase
    .from('recurring_invoices')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
