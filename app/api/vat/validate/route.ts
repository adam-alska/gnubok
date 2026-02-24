import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody } from '@/lib/api/validate'
import { ValidateVatNumberSchema } from '@/lib/api/schemas'
import { validateVatNumber } from '@/lib/vat/vies-client'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
      .eq('user_id', user.id)
  }

  return NextResponse.json(validation)
}
