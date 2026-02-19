import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, AddSalaryRunItemSchema } from '@/lib/validation'

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

  // Verify run ownership
  const { data: run } = await supabase
    .from('salary_runs')
    .select('user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!run) {
    return NextResponse.json({ error: 'Lönekörning hittades inte' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('salary_run_items')
    .select('*, employee:employees(id, employee_number, first_name, last_name, personal_number, employment_type, monthly_salary, hourly_rate, department, title)')
    .eq('salary_run_id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(
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

  // Verify run ownership and status
  const { data: run } = await supabase
    .from('salary_runs')
    .select('user_id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!run) {
    return NextResponse.json({ error: 'Lönekörning hittades inte' }, { status: 404 })
  }

  if (run.status !== 'draft' && run.status !== 'calculated') {
    return NextResponse.json(
      { error: 'Kan inte lägga till anställda i denna lönekörning' },
      { status: 400 }
    )
  }

  const raw = await request.json()
  const validation = validateBody(AddSalaryRunItemSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  // Check if employee already in this run
  const { data: existingItem } = await supabase
    .from('salary_run_items')
    .select('id')
    .eq('salary_run_id', id)
    .eq('employee_id', body.employee_id)
    .single()

  if (existingItem) {
    return NextResponse.json(
      { error: 'Den anställde finns redan i lönekörningen' },
      { status: 409 }
    )
  }

  const { data, error } = await supabase
    .from('salary_run_items')
    .insert({
      salary_run_id: id,
      employee_id: body.employee_id,
      salary_type: body.salary_type || 'monthly',
      hours_worked: body.hours_worked || 0,
      overtime_hours: body.overtime_hours || 0,
      overtime_rate: body.overtime_rate || 0,
      deductions: body.deductions || [],
      additions: body.additions || [],
      is_tax_free: body.is_tax_free || false,
      notes: body.notes,
    })
    .select('*, employee:employees(id, employee_number, first_name, last_name)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update employee count
  const { count } = await supabase
    .from('salary_run_items')
    .select('id', { count: 'exact', head: true })
    .eq('salary_run_id', id)

  await supabase
    .from('salary_runs')
    .update({ employee_count: count || 0, status: 'draft' })
    .eq('id', id)

  return NextResponse.json({ data })
}
