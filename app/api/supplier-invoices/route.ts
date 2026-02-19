import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, CreateSupplierInvoiceInputSchema } from '@/lib/validation'
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
  const supplier_id = searchParams.get('supplier_id')
  const date_from = searchParams.get('date_from')
  const date_to = searchParams.get('date_to')
  const overdue = searchParams.get('overdue')

  let query = supabase
    .from('supplier_invoices')
    .select('*, supplier:suppliers(id, name, bankgiro, plusgiro)', { count: 'exact' })
    .eq('user_id', user.id)
    .order('due_date', { ascending: true })
    .range(from, to)

  if (status) {
    query = query.eq('status', status)
  }

  if (supplier_id) {
    query = query.eq('supplier_id', supplier_id)
  }

  if (date_from) {
    query = query.gte('invoice_date', date_from)
  }

  if (date_to) {
    query = query.lte('invoice_date', date_to)
  }

  if (overdue === 'true') {
    const today = new Date().toISOString().split('T')[0]
    query = query
      .lt('due_date', today)
      .not('status', 'in', '("paid","credited","disputed")')
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Calculate totals for summary
  const today = new Date().toISOString().split('T')[0]

  const { data: summaryData } = await supabase
    .from('supplier_invoices')
    .select('total, due_date, status')
    .eq('user_id', user.id)
    .not('status', 'in', '("paid","credited")')

  const outstanding = (summaryData || []).reduce((sum, inv) => sum + (inv.total || 0), 0)
  const overdueTotal = (summaryData || [])
    .filter((inv) => inv.due_date && inv.due_date < today && !['paid', 'credited', 'disputed'].includes(inv.status))
    .reduce((sum, inv) => sum + (inv.total || 0), 0)
  const overdueCount = (summaryData || [])
    .filter((inv) => inv.due_date && inv.due_date < today && !['paid', 'credited', 'disputed'].includes(inv.status))
    .length

  const total = count ?? 0

  return NextResponse.json({
    data,
    pagination: {
      page,
      per_page,
      total,
      total_pages: Math.ceil(total / per_page),
    },
    summary: {
      outstanding,
      overdue_total: overdueTotal,
      overdue_count: overdueCount,
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
  const validation = validateBody(CreateSupplierInvoiceInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  // Verify supplier exists and belongs to user
  const { data: supplier, error: supplierError } = await supabase
    .from('suppliers')
    .select('id, default_payment_terms')
    .eq('id', body.supplier_id)
    .eq('user_id', user.id)
    .single()

  if (supplierError || !supplier) {
    return NextResponse.json({ error: 'Leverantör hittades inte' }, { status: 404 })
  }

  // Calculate due date from payment terms if not provided
  let dueDate = body.due_date
  if (!dueDate && body.invoice_date) {
    const invoiceDate = new Date(body.invoice_date)
    invoiceDate.setDate(invoiceDate.getDate() + (supplier.default_payment_terms || 30))
    dueDate = invoiceDate.toISOString().split('T')[0]
  }

  // Calculate total_sek for non-SEK invoices
  const currency = body.currency || 'SEK'
  const totalSek = currency === 'SEK' ? body.total : (body.exchange_rate ? body.total * body.exchange_rate : body.total)

  // Insert the invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('supplier_invoices')
    .insert({
      user_id: user.id,
      supplier_id: body.supplier_id,
      invoice_number: body.invoice_number,
      ocr_number: body.ocr_number || null,
      invoice_date: body.invoice_date || null,
      due_date: dueDate || null,
      received_date: body.received_date || new Date().toISOString().split('T')[0],
      status: 'received',
      currency: currency,
      exchange_rate: body.exchange_rate || null,
      subtotal: body.subtotal,
      vat_amount: body.vat_amount,
      total: body.total,
      total_sek: totalSek,
      vat_rate: body.vat_rate ?? 25,
      payment_method: body.payment_method || null,
      payment_reference: body.payment_reference || null,
      attachment_url: body.attachment_url || null,
      notes: body.notes || null,
    })
    .select()
    .single()

  if (invoiceError) {
    return NextResponse.json({ error: invoiceError.message }, { status: 500 })
  }

  // Insert line items
  const itemsData = body.items.map((item, index) => ({
    supplier_invoice_id: invoice.id,
    sort_order: index,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit || 'st',
    unit_price: item.unit_price,
    line_total: item.quantity * item.unit_price,
    account_number: item.account_number || null,
    vat_rate: item.vat_rate ?? body.vat_rate ?? 25,
    vat_amount: (item.quantity * item.unit_price) * ((item.vat_rate ?? body.vat_rate ?? 25) / 100),
    cost_center: item.cost_center || null,
    project: item.project || null,
  }))

  const { error: itemsError } = await supabase
    .from('supplier_invoice_items')
    .insert(itemsData)

  if (itemsError) {
    // Clean up the invoice if items failed
    await supabase.from('supplier_invoices').delete().eq('id', invoice.id)
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  // Fetch complete invoice with items and supplier
  const { data: completeInvoice } = await supabase
    .from('supplier_invoices')
    .select('*, supplier:suppliers(*), items:supplier_invoice_items(*)')
    .eq('id', invoice.id)
    .single()

  return NextResponse.json({ data: completeInvoice })
}
