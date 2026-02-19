import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, CreateOrderInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

function getPaginationParams(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const per_page = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') || '50')))
  const from = (page - 1) * per_page
  const to = from + per_page - 1
  return { page, per_page, from, to }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { searchParams } = new URL(request.url)
  const { page, per_page, from, to } = getPaginationParams(searchParams)
  const status = searchParams.get('status')

  let query = supabase
    .from('orders')
    .select('*, customer:customers(id, name, email)', { count: 'exact' })
    .eq('user_id', user.id)
    .order('order_date', { ascending: false })
    .range(from, to)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const total = count ?? 0

  return NextResponse.json({
    data,
    pagination: {
      page,
      per_page,
      total,
      total_pages: Math.ceil(total / per_page),
    },
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  const body = await request.json()
  const validation = validateBody(CreateOrderInputSchema, body)
  if (!validation.success) return validation.response
  const input = validation.data

  // Verify customer
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', input.customer_id)
    .eq('user_id', user.id)
    .single()

  if (customerError || !customer) {
    return NextResponse.json({ error: 'Kunden hittades inte' }, { status: 404 })
  }

  // Get next order number
  const { data: settings } = await supabase
    .from('company_settings')
    .select('next_order_number, order_prefix, vat_registered')
    .eq('user_id', user.id)
    .single()

  const nextNumber = settings?.next_order_number || 1
  const prefix = settings?.order_prefix || 'ORD'
  const orderNumber = `${prefix}${String(nextNumber).padStart(4, '0')}`

  // Calculate totals
  const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const vatRate = settings?.vat_registered ? 25 : 0
  const vatAmount = subtotal * (vatRate / 100)
  const total = subtotal + vatAmount

  // Create order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: user.id,
      customer_id: input.customer_id,
      quote_id: input.quote_id || null,
      order_number: orderNumber,
      order_date: input.order_date,
      delivery_date: input.delivery_date || null,
      status: 'draft',
      currency: input.currency || 'SEK',
      subtotal,
      vat_amount: vatAmount,
      total,
      vat_treatment: 'standard_25',
      vat_rate: vatRate,
      your_reference: input.your_reference || null,
      our_reference: input.our_reference || null,
      delivery_address: input.delivery_address || null,
      notes: input.notes || null,
    })
    .select()
    .single()

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message || 'Kunde inte skapa order' }, { status: 500 })
  }

  // Create order items
  const orderItems = input.items.map((item, index) => ({
    order_id: order.id,
    sort_order: index,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    line_total: item.quantity * item.unit_price,
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems)

  if (itemsError) {
    await supabase.from('orders').delete().eq('id', order.id)
    return NextResponse.json({ error: 'Kunde inte skapa orderrader' }, { status: 500 })
  }

  // Increment order number
  await supabase
    .from('company_settings')
    .update({ next_order_number: nextNumber + 1 })
    .eq('user_id', user.id)

  // Fetch complete order
  const { data: completeOrder } = await supabase
    .from('orders')
    .select('*, customer:customers(id, name, email), items:order_items(*)')
    .eq('id', order.id)
    .single()

  return NextResponse.json({ data: completeOrder }, { status: 201 })
}
