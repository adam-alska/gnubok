import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, CreateSupplierPaymentInputSchema } from '@/lib/validation'
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

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { searchParams } = new URL(request.url)
  const { page, per_page, from, to } = getPaginationParams(searchParams)
  const status = searchParams.get('status')

  let query = supabase
    .from('supplier_payments')
    .select(`
      *,
      items:supplier_payment_items(
        *,
        supplier_invoice:supplier_invoices(
          id, invoice_number, total, supplier:suppliers(id, name)
        )
      )
    `, { count: 'exact' })
    .eq('user_id', user.id)
    .order('payment_date', { ascending: false })
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

  const { success: postRl, remaining: postRem, reset: postReset } = apiLimiter.check(user.id)
  if (!postRl) return rateLimitResponse(postReset)

  const raw = await request.json()
  const validation = validateBody(CreateSupplierPaymentInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  // Fetch all invoices that are to be included in the payment
  const { data: invoices, error: invoicesError } = await supabase
    .from('supplier_invoices')
    .select('*, supplier:suppliers(id, name, bankgiro, plusgiro)')
    .in('id', body.invoice_ids)
    .eq('user_id', user.id)
    .in('status', ['approved', 'scheduled'])

  if (invoicesError) {
    return NextResponse.json({ error: invoicesError.message }, { status: 500 })
  }

  if (!invoices || invoices.length === 0) {
    return NextResponse.json(
      { error: 'Inga godkända fakturor hittades med de angivna ID:na' },
      { status: 400 }
    )
  }

  // Check that all requested invoices were found
  const foundIds = new Set(invoices.map((inv) => inv.id))
  const missingIds = body.invoice_ids.filter((id) => !foundIds.has(id))
  if (missingIds.length > 0) {
    return NextResponse.json(
      { error: `Följande fakturor kunde inte hittas eller är inte godkända: ${missingIds.join(', ')}` },
      { status: 400 }
    )
  }

  // Calculate totals
  const totalAmount = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0)

  // Create payment batch
  const { data: payment, error: paymentError } = await supabase
    .from('supplier_payments')
    .insert({
      user_id: user.id,
      payment_date: body.payment_date,
      status: 'draft',
      total_amount: totalAmount,
      payment_count: invoices.length,
    })
    .select()
    .single()

  if (paymentError) {
    return NextResponse.json({ error: paymentError.message }, { status: 500 })
  }

  // Create payment items
  const paymentItems = invoices.map((inv) => ({
    payment_id: payment.id,
    supplier_invoice_id: inv.id,
    amount: inv.total,
    payment_method: inv.payment_method || (inv.supplier?.bankgiro ? 'bankgiro' : inv.supplier?.plusgiro ? 'plusgiro' : 'bank_transfer'),
    reference: inv.ocr_number || inv.payment_reference || inv.invoice_number,
  }))

  const { error: itemsError } = await supabase
    .from('supplier_payment_items')
    .insert(paymentItems)

  if (itemsError) {
    // Clean up payment if items failed
    await supabase.from('supplier_payments').delete().eq('id', payment.id)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  // Update invoice statuses to 'scheduled'
  const { error: updateError } = await supabase
    .from('supplier_invoices')
    .update({ status: 'scheduled' })
    .in('id', body.invoice_ids)
    .eq('user_id', user.id)

  if (updateError) {
    console.error('Failed to update invoice statuses:', updateError)
  }

  // Fetch complete payment with items
  const { data: completePayment } = await supabase
    .from('supplier_payments')
    .select(`
      *,
      items:supplier_payment_items(
        *,
        supplier_invoice:supplier_invoices(
          id, invoice_number, total, supplier:suppliers(id, name, bankgiro, plusgiro)
        )
      )
    `)
    .eq('id', payment.id)
    .single()

  return NextResponse.json({ data: completePayment })
}
