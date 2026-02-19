import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, UpdateSalaryRunInputSchema } from '@/lib/validation'

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
    .from('salary_runs')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Lönekörning hittades inte' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Also fetch items with employee data
  const { data: items } = await supabase
    .from('salary_run_items')
    .select('*, employee:employees(id, employee_number, first_name, last_name, personal_number, employment_type, monthly_salary, hourly_rate)')
    .eq('salary_run_id', id)

  return NextResponse.json({ data: { ...data, items: items || [] } })
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

  const { success: rl, remaining, reset: rlReset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(rlReset)

  // Check current status - cannot modify approved/paid/reported runs
  const { data: current } = await supabase
    .from('salary_runs')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!current) {
    return NextResponse.json({ error: 'Lönekörning hittades inte' }, { status: 404 })
  }

  if (['approved', 'paid', 'reported'].includes(current.status)) {
    return NextResponse.json(
      { error: 'Kan inte ändra en godkänd/utbetald lönekörning' },
      { status: 400 }
    )
  }

  const raw = await request.json()
  const validation = validateBody(UpdateSalaryRunInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const updateData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      updateData[key] = value
    }
  }

  const { data, error } = await supabase
    .from('salary_runs')
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

  const { success: rl, remaining, reset: rlReset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(rlReset)

  // Only draft runs can be deleted
  const { data: current } = await supabase
    .from('salary_runs')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!current) {
    return NextResponse.json({ error: 'Lönekörning hittades inte' }, { status: 404 })
  }

  if (current.status !== 'draft') {
    return NextResponse.json(
      { error: 'Kan bara ta bort lönekörningar i utkast-status' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('salary_runs')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
