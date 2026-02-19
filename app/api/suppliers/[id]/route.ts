import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, UpdateSupplierInputSchema } from '@/lib/validation'
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
    .from('suppliers')
    .select(`
      *,
      supplier_invoices(
        id, invoice_number, invoice_date, due_date, status, total, currency, paid_at
      )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Leverantör hittades inte' }, { status: 404 })
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
  const validation = validateBody(UpdateSupplierInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const updateData: Record<string, unknown> = {}

  if (body.name !== undefined) updateData.name = body.name
  if (body.org_number !== undefined) updateData.org_number = body.org_number
  if (body.vat_number !== undefined) updateData.vat_number = body.vat_number
  if (body.email !== undefined) updateData.email = body.email
  if (body.phone !== undefined) updateData.phone = body.phone
  if (body.address_line1 !== undefined) updateData.address_line1 = body.address_line1
  if (body.postal_code !== undefined) updateData.postal_code = body.postal_code
  if (body.city !== undefined) updateData.city = body.city
  if (body.country !== undefined) updateData.country = body.country
  if (body.bankgiro !== undefined) updateData.bankgiro = body.bankgiro
  if (body.plusgiro !== undefined) updateData.plusgiro = body.plusgiro
  if (body.iban !== undefined) updateData.iban = body.iban
  if (body.bic !== undefined) updateData.bic = body.bic
  if (body.clearing_number !== undefined) updateData.clearing_number = body.clearing_number
  if (body.account_number !== undefined) updateData.account_number = body.account_number
  if (body.default_payment_terms !== undefined) updateData.default_payment_terms = body.default_payment_terms
  if (body.category !== undefined) updateData.category = body.category
  if (body.notes !== undefined) updateData.notes = body.notes
  if (body.is_active !== undefined) updateData.is_active = body.is_active

  const { data, error } = await supabase
    .from('suppliers')
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

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: delRl, remaining: delRem, reset: delReset } = apiLimiter.check(user.id)
  if (!delRl) return rateLimitResponse(delReset)

  // Check for unpaid invoices first
  const { count } = await supabase
    .from('supplier_invoices')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', id)
    .eq('user_id', user.id)
    .not('status', 'in', '("paid","credited")')

  if (count && count > 0) {
    return NextResponse.json(
      { error: 'Kan inte ta bort leverantör med obetalda fakturor' },
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
