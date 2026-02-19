import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, CreateEmployeeInputSchema } from '@/lib/validation'

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
  const activeOnly = searchParams.get('active') !== 'false'
  const department = searchParams.get('department')
  const search = searchParams.get('search')

  let query = supabase
    .from('employees')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('last_name', { ascending: true })
    .range(from, to)

  if (activeOnly) {
    query = query.eq('is_active', true)
  }

  if (department) {
    query = query.eq('department', department)
  }

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_number.ilike.%${search}%`)
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
  const validation = validateBody(CreateEmployeeInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const { data, error } = await supabase
    .from('employees')
    .insert({
      user_id: user.id,
      employee_number: body.employee_number,
      first_name: body.first_name,
      last_name: body.last_name,
      personal_number: body.personal_number,
      email: body.email,
      phone: body.phone,
      address_line1: body.address_line1,
      postal_code: body.postal_code,
      city: body.city,
      employment_type: body.employment_type,
      employment_start_date: body.employment_start_date,
      employment_end_date: body.employment_end_date,
      department: body.department,
      title: body.title,
      monthly_salary: body.monthly_salary || 0,
      hourly_rate: body.hourly_rate || 0,
      tax_table: body.tax_table,
      tax_column: body.tax_column,
      tax_municipality: body.tax_municipality,
      bank_clearing: body.bank_clearing,
      bank_account: body.bank_account,
      vacation_days_total: body.vacation_days_total ?? 25,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `Anstallningsnummer ${body.employee_number} finns redan` },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
