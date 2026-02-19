import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, AttestSupplierInvoiceInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(
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

  const raw = await request.json()
  const validation = validateBody(AttestSupplierInvoiceInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  // Verify invoice exists and belongs to user
  const { data: invoice, error: invoiceError } = await supabase
    .from('supplier_invoices')
    .select('id, status, invoice_number')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: 'Leverantörsfaktura hittades inte' }, { status: 404 })
  }

  // Check that invoice is in a state that can be attested
  if (!['received', 'attested'].includes(invoice.status)) {
    return NextResponse.json(
      { error: 'Fakturan kan inte attesteras i nuvarande status' },
      { status: 400 }
    )
  }

  // Create attestation record
  const { data: attestation, error: attestError } = await supabase
    .from('supplier_invoice_attestations')
    .insert({
      supplier_invoice_id: id,
      user_id: user.id,
      action: body.action,
      comment: body.comment || null,
    })
    .select()
    .single()

  if (attestError) {
    return NextResponse.json({ error: attestError.message }, { status: 500 })
  }

  // Update invoice status based on action
  let newStatus: string
  if (body.action === 'attested') {
    newStatus = 'attested'
  } else if (body.action === 'rejected') {
    newStatus = 'disputed'
  } else {
    // 'commented' doesn't change status
    newStatus = invoice.status
  }

  if (newStatus !== invoice.status) {
    const { error: updateError } = await supabase
      .from('supplier_invoices')
      .update({ status: newStatus })
      .eq('id', id)
      .eq('user_id', user.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  }

  // Fetch updated invoice
  const { data: updatedInvoice } = await supabase
    .from('supplier_invoices')
    .select(`
      *,
      supplier:suppliers(*),
      items:supplier_invoice_items(*),
      attestations:supplier_invoice_attestations(*)
    `)
    .eq('id', id)
    .single()

  return NextResponse.json({
    data: {
      invoice: updatedInvoice,
      attestation,
    },
  })
}
