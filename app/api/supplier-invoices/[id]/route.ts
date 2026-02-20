import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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

  const { data: invoice, error } = await supabase
    .from('supplier_invoices')
    .select('*, supplier:suppliers(*), items:supplier_invoice_items(*), payments:supplier_invoice_payments(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !invoice) {
    return NextResponse.json({ error: 'Supplier invoice not found' }, { status: 404 })
  }

  return NextResponse.json({ data: invoice })
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

  // Only allow editing registered invoices
  const { data: existing } = await supabase
    .from('supplier_invoices')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (existing.status !== 'registered') {
    return NextResponse.json(
      { error: 'Kan bara redigera registrerade fakturor' },
      { status: 400 }
    )
  }

  const body = await request.json()

  const { data, error } = await supabase
    .from('supplier_invoices')
    .update({
      supplier_invoice_number: body.supplier_invoice_number,
      invoice_date: body.invoice_date,
      due_date: body.due_date,
      delivery_date: body.delivery_date,
      payment_reference: body.payment_reference,
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

  // Only allow deleting registered invoices without journal entries
  const { data: existing } = await supabase
    .from('supplier_invoices')
    .select('status, registration_journal_entry_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (existing.status !== 'registered') {
    return NextResponse.json(
      { error: 'Kan bara ta bort registrerade fakturor' },
      { status: 400 }
    )
  }

  // Delete items first, then invoice
  await supabase.from('supplier_invoice_items').delete().eq('supplier_invoice_id', id)

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
