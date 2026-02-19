import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, CreateSalaryRunInputSchema } from '@/lib/validation'

function getPaginationParams(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const per_page = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') || '50')))
  const from = (page - 1) * per_page
  const to = from + per_page - 1
  return { page, per_page, from, to }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { searchParams } = new URL(request.url)
  const { page, per_page, from, to } = getPaginationParams(searchParams)
  const year = searchParams.get('year')
  const month = searchParams.get('month')
  const status = searchParams.get('status')

  let query = supabase
    .from('salary_runs')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .range(from, to)

  if (year) {
    query = query.eq('period_year', parseInt(year))
  }

  if (month) {
    query = query.eq('period_month', parseInt(month))
  }

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const total = count ?? 0

  return NextResponse.json({
    data,
    pagination: {
      page,
      per_page,
      total,
      total_pages: Math.ceil(total / per_page),
    },
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, remaining, reset: rlReset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(rlReset)

  const raw = await request.json()
  const validation = validateBody(CreateSalaryRunInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  // Create the salary run
  const { data: salaryRun, error } = await supabase
    .from('salary_runs')
    .insert({
      user_id: user.id,
      run_name: body.run_name,
      period_year: body.period_year,
      period_month: body.period_month,
      payment_date: body.payment_date,
      status: 'draft',
      notes: body.notes,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Auto-add all active permanent/temporary employees
  const { data: employees } = await supabase
    .from('employees')
    .select('id, employment_type')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .in('employment_type', ['permanent', 'temporary'])

  if (employees && employees.length > 0) {
    const items = employees.map(emp => ({
      salary_run_id: salaryRun.id,
      employee_id: emp.id,
      salary_type: 'monthly' as const,
    }))

    await supabase.from('salary_run_items').insert(items)

    // Update employee count
    await supabase
      .from('salary_runs')
      .update({ employee_count: employees.length })
      .eq('id', salaryRun.id)
  }

  return NextResponse.json({ data: salaryRun })
}
