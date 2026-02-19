import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, CreatePaymentMethodSchema } from '@/lib/validation'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { data, error } = await supabase
    .from('payment_methods')
    .select('*')
    .eq('user_id', user.id)
    .order('method_type', { ascending: true })

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

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  const raw = await request.json()
  const validation = validateBody(CreatePaymentMethodSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  // If setting as default, unset other defaults of same type
  if (body.is_default) {
    await supabase
      .from('payment_methods')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('method_type', body.method_type)
  }

  const { data, error } = await supabase
    .from('payment_methods')
    .insert({
      user_id: user.id,
      method_type: body.method_type,
      account_number: body.account_number || null,
      description: body.description || null,
      is_default: body.is_default || false,
      linked_bank_account: body.linked_bank_account || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
