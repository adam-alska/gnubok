import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, UpdateOrderInputSchema } from '@/lib/validation'
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
    .from('orders')
    .select('*, customer:customers(*), items:order_items(*), quote:quotes(id, quote_number, status)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Ordern hittades inte' }, { status: 404 })
  }

  // Sort items by sort_order
  if (data.items) {
    (data.items as Array<{ sort_order: number }>).sort((a, b) => a.sort_order - b.sort_order)
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
  const validation = validateBody(UpdateOrderInputSchema, body)
  if (!validation.success) return validation.response
  const input = validation.data

  // Build update object
  const updates: Record<string, unknown> = {}
  if (input.customer_id !== undefined) updates.customer_id = input.customer_id
  if (input.order_date !== undefined) updates.order_date = input.order_date
  if (input.delivery_date !== undefined) updates.delivery_date = input.delivery_date
  if (input.currency !== undefined) updates.currency = input.currency
  if (input.status !== undefined) updates.status = input.status
  if (input.your_reference !== undefined) updates.your_reference = input.your_reference
  if (input.our_reference !== undefined) updates.our_reference = input.our_reference
  if (input.delivery_address !== undefined) updates.delivery_address = input.delivery_address
  if (input.notes !== undefined) updates.notes = input.notes

  // If items are provided, recalculate totals
  if (input.items) {
    const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
    const { data: settings } = await supabase
      .from('company_settings')
      .select('vat_registered')
      .eq('user_id', user.id)
      .single()

    const vatRate = settings?.vat_registered ? 25 : 0
    const vatAmount = subtotal * (vatRate / 100)
    updates.subtotal = subtotal
    updates.vat_amount = vatAmount
    updates.total = subtotal + vatAmount

    // Delete old items and insert new ones
    await supabase.from('order_items').delete().eq('order_id', id)

    const orderItems = input.items.map((item, index) => ({
      order_id: id,
      sort_order: index,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      line_total: item.quantity * item.unit_price,
    }))

    await supabase.from('order_items').insert(orderItems)
  }

  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*, customer:customers(id, name, email), items:order_items(*)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Ordern hittades inte' }, { status: 404 })
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

  // Check status
  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!order) {
    return NextResponse.json({ error: 'Ordern hittades inte' }, { status: 404 })
  }

  if (!['draft', 'cancelled'].includes(order.status)) {
    return NextResponse.json({ error: 'Bara utkast eller makulerade ordrar kan raderas' }, { status: 400 })
  }

  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
