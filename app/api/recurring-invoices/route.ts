import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, CreateRecurringInvoiceInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { searchParams } = new URL(request.url)
  const isActive = searchParams.get('active')

  let query = supabase
    .from('recurring_invoices')
    .select('*, customer:customers(id, name, email)')
    .eq('user_id', user.id)
    .order('next_invoice_date', { ascending: true })

  if (isActive === 'true') {
    query = query.eq('is_active', true)
  } else if (isActive === 'false') {
    query = query.eq('is_active', false)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
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
  const validation = validateBody(CreateRecurringInvoiceInputSchema, body)
  if (!validation.success) return validation.response
  const input = validation.data

  // Verify customer belongs to user
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id')
    .eq('id', input.customer_id)
    .eq('user_id', user.id)
    .single()

  if (customerError || !customer) {
    return NextResponse.json({ error: 'Kunden hittades inte' }, { status: 404 })
  }

  // Get VAT settings from company
  const { data: settings } = await supabase
    .from('company_settings')
    .select('vat_registered')
    .eq('user_id', user.id)
    .single()

  const vatRate = settings?.vat_registered ? 25 : 0

  // Create the recurring invoice
  const { data: recurring, error: createError } = await supabase
    .from('recurring_invoices')
    .insert({
      user_id: user.id,
      customer_id: input.customer_id,
      template_name: input.template_name,
      description: input.description || null,
      frequency: input.frequency,
      interval_count: input.interval_count || 1,
      start_date: input.start_date,
      end_date: input.end_date || null,
      next_invoice_date: input.start_date,
      items: input.items,
      currency: input.currency || 'SEK',
      vat_treatment: 'standard_25',
      vat_rate: vatRate,
      your_reference: input.your_reference || null,
      our_reference: input.our_reference || null,
      notes: input.notes || null,
      payment_terms_days: input.payment_terms_days || 30,
    })
    .select('*, customer:customers(id, name, email)')
    .single()

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 })
  }

  return NextResponse.json({ data: recurring }, { status: 201 })
}
