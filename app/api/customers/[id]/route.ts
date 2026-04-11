import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody } from '@/lib/api/validate'
import { UpdateCustomerSchema } from '@/lib/api/schemas'
import { validateVatNumber } from '@/lib/vat/vies-client'
import { requireCompanyId } from '@/lib/company/context'
import { requireWritePermission } from '@/lib/auth/require-write'
import { createLogger } from '@/lib/logger'

const log = createLogger('api/customers/[id]')

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

  const companyId = await requireCompanyId(supabase, user.id)

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch related invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, due_date, status, total, currency')
    .eq('customer_id', id)
    .eq('company_id', companyId)
    .order('invoice_date', { ascending: false })

  return NextResponse.json({
    data: {
      ...data,
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

  const writeCheck = await requireWritePermission(supabase, user.id)
  if (!writeCheck.ok) return writeCheck.response

  const companyId = await requireCompanyId(supabase, user.id)

  const result = await validateBody(request, UpdateCustomerSchema)
  if (!result.success) return result.response
  const body = result.data

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
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Auto-validate VAT number when it changes on an EU business customer (non-blocking)
  const isEuBusiness = (body.customer_type || data.customer_type) === 'eu_business'
  if (body.vat_number !== undefined && isEuBusiness) {
    try {
      if (body.vat_number) {
        const vatResult = await validateVatNumber(body.vat_number)
        if (vatResult.valid) {
          await supabase
            .from('customers')
            .update({
              vat_number_validated: true,
              vat_number_validated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('company_id', companyId)

          data.vat_number_validated = true
          data.vat_number_validated_at = new Date().toISOString()
        } else {
          await supabase
            .from('customers')
            .update({
              vat_number_validated: false,
              vat_number_validated_at: null,
            })
            .eq('id', id)
            .eq('company_id', companyId)

          data.vat_number_validated = false
          data.vat_number_validated_at = null
        }
      } else {
        // VAT number cleared
        await supabase
          .from('customers')
          .update({
            vat_number_validated: false,
            vat_number_validated_at: null,
          })
          .eq('id', id)
          .eq('company_id', companyId)

        data.vat_number_validated = false
        data.vat_number_validated_at = null
      }
    } catch (err) {
      log.warn('Auto-VIES validation failed on customer update:', err)
    }
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

  const writeCheck = await requireWritePermission(supabase, user.id)
  if (!writeCheck.ok) return writeCheck.response

  const companyId = await requireCompanyId(supabase, user.id)

  const { error, count } = await supabase
    .from('customers')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (count === 0) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
