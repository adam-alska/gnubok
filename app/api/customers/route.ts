import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { CreateCustomerInput } from '@/types'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', user.id)
    .order('name', { ascending: true })

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

  const body: CreateCustomerInput = await request.json()

  const { data, error } = await supabase
    .from('customers')
    .insert({
      user_id: user.id,
      name: body.name,
      customer_type: body.customer_type,
      email: body.email,
      phone: body.phone,
      address_line1: body.address_line1,
      address_line2: body.address_line2,
      postal_code: body.postal_code,
      city: body.city,
      country: body.country || 'Sweden',
      org_number: body.org_number,
      vat_number: body.vat_number,
      default_payment_terms: body.default_payment_terms || 30,
      notes: body.notes,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
