import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody } from '@/lib/api/validate'
import { ValidateVatNumberSchema } from '@/lib/api/schemas'
import { validateVatNumber } from '@/lib/vat/vies-client'
import { requireCompanyId } from '@/lib/company/context'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  const result = await validateBody(request, ValidateVatNumberSchema)
  if (!result.success) return result.response
  const { vat_number, customer_id } = result.data

  const validation = await validateVatNumber(vat_number)

  // Update customer record if customer_id provided and VAT is valid
  if (customer_id && validation.valid) {
    await supabase
      .from('customers')
      .update({
        vat_number: validation.vat_number,
        vat_number_validated: true,
        vat_number_validated_at: new Date().toISOString(),
      })
      .eq('id', customer_id)
      .eq('company_id', companyId)
  }

  return NextResponse.json(validation)
}
