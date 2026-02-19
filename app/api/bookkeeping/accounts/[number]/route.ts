import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, UpdateAccountInputSchema } from '@/lib/validation'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ number: string }> }
) {
  const { number } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const raw = await request.json()
  const validation = validateBody(UpdateAccountInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const { data, error } = await supabase
    .from('chart_of_accounts')
    .update({
      account_name: body.account_name,
      is_active: body.is_active,
      description: body.description,
      default_vat_code: body.default_vat_code,
    })
    .eq('user_id', user.id)
    .eq('account_number', number)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
