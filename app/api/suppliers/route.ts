import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody } from '@/lib/api/validate'
import { CreateSupplierSchema } from '@/lib/api/schemas'
import { requireCompanyId } from '@/lib/company/context'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('company_id', companyId)
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

  const companyId = await requireCompanyId(supabase, user.id)

  const result = await validateBody(request, CreateSupplierSchema)
  if (!result.success) return result.response
  const body = result.data

  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      user_id: user.id,
      company_id: companyId,
      name: body.name,
      supplier_type: body.supplier_type,
      email: body.email,
      phone: body.phone,
      address_line1: body.address_line1,
      address_line2: body.address_line2,
      postal_code: body.postal_code,
      city: body.city,
      country: body.country || 'SE',
      org_number: body.org_number,
      vat_number: body.vat_number,
      bankgiro: body.bankgiro,
      plusgiro: body.plusgiro,
      bank_account: body.bank_account,
      iban: body.iban,
      bic: body.bic,
      default_expense_account: body.default_expense_account,
      default_payment_terms: body.default_payment_terms || 30,
      default_currency: body.default_currency || 'SEK',
      notes: body.notes,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
