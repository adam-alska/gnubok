import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { CreateCustomerInput } from '@/types'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch related campaigns
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, status, total_value, currency, publication_date, brand_name')
    .eq('customer_id', id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Fetch related invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, due_date, status, total, currency, payment_status')
    .eq('customer_id', id)
    .eq('user_id', user.id)
    .order('invoice_date', { ascending: false })

  return NextResponse.json({
    data: {
      ...data,
      campaigns: campaigns || [],
      invoices: invoices || [],
    },
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: Partial<CreateCustomerInput> = await request.json()

  const updateData: Record<string, unknown> = {}

  if (body.name !== undefined) updateData.name = body.name
  if (body.customer_type !== undefined) updateData.customer_type = body.customer_type
  if (body.email !== undefined) updateData.email = body.email
  if (body.phone !== undefined) updateData.phone = body.phone
  if (body.address_line1 !== undefined) updateData.address_line1 = body.address_line1
  if (body.address_line2 !== undefined) updateData.address_line2 = body.address_line2
  if (body.postal_code !== undefined) updateData.postal_code = body.postal_code
  if (body.city !== undefined) updateData.city = body.city
  if (body.country !== undefined) updateData.country = body.country
  if (body.org_number !== undefined) updateData.org_number = body.org_number
  if (body.vat_number !== undefined) updateData.vat_number = body.vat_number
  if (body.default_payment_terms !== undefined) updateData.default_payment_terms = body.default_payment_terms
  if (body.notes !== undefined) updateData.notes = body.notes

  const { data, error } = await supabase
    .from('customers')
    .update(updateData)
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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
