import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, CreateAccountInputSchema } from '@/lib/validation'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { searchParams } = new URL(request.url)
  const accountClass = searchParams.get('class')
  const activeOnly = searchParams.get('active') !== 'false'

  let query = supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')

  if (activeOnly) {
    query = query.eq('is_active', true)
  }

  if (accountClass) {
    query = query.eq('account_class', parseInt(accountClass))
  }

  const { data, error } = await query

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

  const { success: postRl, remaining: postRem, reset: postReset } = apiLimiter.check(user.id)
  if (!postRl) return rateLimitResponse(postReset)

  const raw = await request.json()
  const validation = validateBody(CreateAccountInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const { data, error } = await supabase
    .from('chart_of_accounts')
    .insert({
      user_id: user.id,
      account_number: body.account_number,
      account_name: body.account_name,
      account_class: parseInt(body.account_number[0]),
      account_group: body.account_number.substring(0, 2),
      account_type: body.account_type,
      normal_balance: body.normal_balance,
      plan_type: body.plan_type || 'k1',
      is_system_account: false,
      description: body.description || null,
      sort_order: parseInt(body.account_number),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
