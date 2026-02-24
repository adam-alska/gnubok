import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody } from '@/lib/api/validate'
import { UpdateSupplierSchema } from '@/lib/api/schemas'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch supplier
  const { data: supplier, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !supplier) {
    return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
  }

  // Fetch stats: total outstanding & total paid
  const { data: invoices } = await supabase
    .from('supplier_invoices')
    .select('status, total, remaining_amount, paid_amount')
    .eq('supplier_id', id)
    .eq('user_id', user.id)

  const stats = {
    total_outstanding: 0,
    total_paid: 0,
    invoice_count: 0,
  }

  if (invoices) {
    stats.invoice_count = invoices.length
    for (const inv of invoices) {
      if (inv.status !== 'paid' && inv.status !== 'credited') {
        stats.total_outstanding += inv.remaining_amount || 0
      }
      stats.total_paid += inv.paid_amount || 0
    }
  }

  return NextResponse.json({ data: { ...supplier, stats } })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await validateBody(request, UpdateSupplierSchema)
  if (!result.success) return result.response
  const body = result.data

  const { data, error } = await supabase
    .from('suppliers')
    .update({
      name: body.name,
      supplier_type: body.supplier_type,
      email: body.email,
      phone: body.phone,
      address_line1: body.address_line1,
      address_line2: body.address_line2,
      postal_code: body.postal_code,
      city: body.city,
      country: body.country,
      org_number: body.org_number,
      vat_number: body.vat_number,
      bankgiro: body.bankgiro,
      plusgiro: body.plusgiro,
      bank_account: body.bank_account,
      iban: body.iban,
      bic: body.bic,
      default_expense_account: body.default_expense_account,
      default_payment_terms: body.default_payment_terms,
      default_currency: body.default_currency,
      notes: body.notes,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check for linked invoices
  const { count } = await supabase
    .from('supplier_invoices')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', id)
    .eq('user_id', user.id)

  if (count && count > 0) {
    return NextResponse.json(
      { error: 'Kan inte ta bort leverantör med kopplade fakturor' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('suppliers')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
