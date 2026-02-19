import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, CreateAbsenceInputSchema } from '@/lib/validation'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { searchParams } = new URL(request.url)
  const employeeId = searchParams.get('employee_id')
  const year = searchParams.get('year')
  const month = searchParams.get('month')

  let query = supabase
    .from('absence_records')
    .select('*, employee:employees(id, first_name, last_name, employee_number)')
    .eq('user_id', user.id)
    .order('start_date', { ascending: false })

  if (employeeId) {
    query = query.eq('employee_id', employeeId)
  }

  if (year && month) {
    const startOfMonth = `${year}-${String(parseInt(month)).padStart(2, '0')}-01`
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
    const endOfMonth = `${year}-${String(parseInt(month)).padStart(2, '0')}-${lastDay}`
    query = query.gte('end_date', startOfMonth).lte('start_date', endOfMonth)
  } else if (year) {
    query = query.gte('end_date', `${year}-01-01`).lte('start_date', `${year}-12-31`)
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

  const { success: rl, remaining, reset: rlReset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(rlReset)

  const raw = await request.json()
  const validation = validateBody(CreateAbsenceInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  // Verify employee ownership
  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('id', body.employee_id)
    .eq('user_id', user.id)
    .single()

  if (!employee) {
    return NextResponse.json({ error: 'Anstalld hittades inte' }, { status: 404 })
  }

  // Default deduction percentage based on absence type
  let deductionPercentage = body.deduction_percentage
  if (deductionPercentage === undefined) {
    switch (body.absence_type) {
      case 'sick_leave':
        deductionPercentage = 20 // 80% sick pay, 20% deduction
        break
      case 'parental_leave':
        deductionPercentage = 20 // 80% from Forsakringskassan
        break
      case 'vacation':
        deductionPercentage = 0 // Paid vacation
        break
      case 'child_care':
        deductionPercentage = 20 // VAB - 80% from Forsakringskassan
        break
      case 'unpaid_leave':
        deductionPercentage = 100 // Full deduction
        break
      default:
        deductionPercentage = 100
    }
  }

  const { data, error } = await supabase
    .from('absence_records')
    .insert({
      user_id: user.id,
      employee_id: body.employee_id,
      absence_type: body.absence_type,
      start_date: body.start_date,
      end_date: body.end_date,
      days_count: body.days_count,
      hours_per_day: body.hours_per_day || 8,
      deduction_percentage: deductionPercentage,
      notes: body.notes,
    })
    .select('*, employee:employees(id, first_name, last_name)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
