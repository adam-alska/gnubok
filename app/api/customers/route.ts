import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { eventBus } from '@/lib/events'
import { ensureInitialized } from '@/lib/init'
import { validateBody } from '@/lib/api/validate'
import { CreateCustomerSchema } from '@/lib/api/schemas'
import { validateVatNumber } from '@/lib/vat/vies-client'
import { requireCompanyId } from '@/lib/company/context'
import { requireWritePermission } from '@/lib/auth/require-write'
import { createLogger } from '@/lib/logger'
import type { Customer } from '@/types'

const log = createLogger('api/customers')

ensureInitialized()

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  const { data, error } = await supabase
    .from('customers')
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

  const writeCheck = await requireWritePermission(supabase, user.id)
  if (!writeCheck.ok) return writeCheck.response

  const companyId = await requireCompanyId(supabase, user.id)

  const result = await validateBody(request, CreateCustomerSchema)
  if (!result.success) return result.response
  const body = result.data

  const { data, error } = await supabase
    .from('customers')
    .insert({
      user_id: user.id,
      company_id: companyId,
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

  // Auto-validate VAT number for EU business customers (non-blocking)
  if (body.customer_type === 'eu_business' && body.vat_number) {
    try {
      const vatResult = await validateVatNumber(body.vat_number)
      if (vatResult.valid) {
        await supabase
          .from('customers')
          .update({
            vat_number_validated: true,
            vat_number_validated_at: new Date().toISOString(),
          })
          .eq('id', data.id)
          .eq('company_id', companyId)

        data.vat_number_validated = true
        data.vat_number_validated_at = new Date().toISOString()
      }
    } catch (err) {
      log.warn('Auto-VIES validation failed on customer create:', err)
    }
  }

  await eventBus.emit({
    type: 'customer.created',
    payload: { customer: data as Customer, companyId, userId: user.id },
  })

  return NextResponse.json({ data })
}
