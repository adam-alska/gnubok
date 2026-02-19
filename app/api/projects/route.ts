import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, CreateProjectInputSchema } from '@/lib/validation'
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
  const status = searchParams.get('status')
  const includeInactive = searchParams.get('include_inactive') === 'true'

  let query = supabase
    .from('projects')
    .select('*, customer:customers(id, name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

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
  const validation = validateBody(CreateProjectInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      project_number: body.project_number,
      name: body.name,
      description: body.description,
      customer_id: body.customer_id,
      status: body.status || 'planning',
      start_date: body.start_date,
      end_date: body.end_date,
      budget_amount: body.budget_amount || 0,
      is_active: body.is_active ?? true,
    })
    .select('*, customer:customers(id, name)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Projekt med detta nummer finns redan' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
