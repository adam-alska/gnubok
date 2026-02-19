import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, UpdateSupplierInvoiceInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { data, error } = await supabase
    .from('supplier_invoices')
    .select(`
      *,
      supplier:suppliers(*),
      items:supplier_invoice_items(*),
      attestations:supplier_invoice_attestations(*)
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Leverantörsfaktura hittades inte' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: patchRl, remaining: patchRem, reset: patchReset } = apiLimiter.check(user.id)
  if (!patchRl) return rateLimitResponse(patchReset)

  const raw = await request.json()
  const validation = validateBody(UpdateSupplierInvoiceInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  // Fetch current invoice to check status transitions
  const { data: current, error: currentError } = await supabase
    .from('supplier_invoices')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (currentError || !current) {
    return NextResponse.json({ error: 'Leverantörsfaktura hittades inte' }, { status: 404 })
  }

  // Validate status transitions
  if (body.status) {
    const validTransitions: Record<string, string[]> = {
      draft: ['received'],
      received: ['attested', 'disputed', 'draft'],
      attested: ['approved', 'disputed', 'received'],
      approved: ['scheduled', 'paid', 'disputed'],
      scheduled: ['paid', 'approved'],
      paid: ['credited'],
      disputed: ['received', 'credited'],
      credited: [],
    }

    const allowed = validTransitions[current.status] || []
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Kan inte ändra status från "${current.status}" till "${body.status}"` },
        { status: 400 }
      )
    }
  }

  const updateData: Record<string, unknown> = {}

  if (body.invoice_number !== undefined) updateData.invoice_number = body.invoice_number
  if (body.ocr_number !== undefined) updateData.ocr_number = body.ocr_number
  if (body.invoice_date !== undefined) updateData.invoice_date = body.invoice_date
  if (body.due_date !== undefined) updateData.due_date = body.due_date
  if (body.status !== undefined) updateData.status = body.status
  if (body.currency !== undefined) updateData.currency = body.currency
  if (body.exchange_rate !== undefined) updateData.exchange_rate = body.exchange_rate
  if (body.subtotal !== undefined) updateData.subtotal = body.subtotal
  if (body.vat_amount !== undefined) updateData.vat_amount = body.vat_amount
  if (body.total !== undefined) updateData.total = body.total
  if (body.vat_rate !== undefined) updateData.vat_rate = body.vat_rate
  if (body.payment_method !== undefined) updateData.payment_method = body.payment_method
  if (body.payment_reference !== undefined) updateData.payment_reference = body.payment_reference
  if (body.attachment_url !== undefined) updateData.attachment_url = body.attachment_url
  if (body.notes !== undefined) updateData.notes = body.notes

  // Handle paid status
  if (body.status === 'paid' && !updateData.paid_at) {
    updateData.paid_at = new Date().toISOString()
    updateData.paid_amount = updateData.total || undefined
  }

  const { data, error } = await supabase
    .from('supplier_invoices')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*, supplier:suppliers(*), items:supplier_invoice_items(*)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: delRl, remaining: delRem, reset: delReset } = apiLimiter.check(user.id)
  if (!delRl) return rateLimitResponse(delReset)

  // Only allow deletion of draft/received invoices
  const { data: invoice } = await supabase
    .from('supplier_invoices')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!invoice) {
    return NextResponse.json({ error: 'Leverantörsfaktura hittades inte' }, { status: 404 })
  }

  if (!['draft', 'received'].includes(invoice.status)) {
    return NextResponse.json(
      { error: 'Kan bara ta bort fakturor med status utkast eller mottagen' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('supplier_invoices')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
