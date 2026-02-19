import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, CreateCostCenterInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { searchParams } = new URL(request.url)
  const includeInactive = searchParams.get('include_inactive') === 'true'

  let query = supabase
    .from('cost_centers')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true })

  if (!includeInactive) {
    query = query.eq('is_active', true)
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

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  const raw = await request.json()
  const validation = validateBody(CreateCostCenterInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const { data, error } = await supabase
    .from('cost_centers')
    .insert({
      user_id: user.id,
      code: body.code,
      name: body.name,
      description: body.description,
      parent_id: body.parent_id,
      manager_name: body.manager_name,
      is_active: body.is_active ?? true,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Kostnadsställe med denna kod finns redan' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
