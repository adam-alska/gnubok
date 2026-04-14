import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { validateBody } from '@/lib/api/validate'
import { CreateSalaryRunSchema } from '@/lib/api/schemas'
import { requireCompanyId } from '@/lib/company/context'
import { requireWritePermission } from '@/lib/auth/require-write'
import { eventBus } from '@/lib/events'

ensureInitialized()

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await requireCompanyId(supabase, user.id)

  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year')

  let query = supabase
    .from('salary_runs')
    .select('*')
    .eq('company_id', companyId)

  if (year) {
    query = query.eq('period_year', parseInt(year))
  }

  const { data, error } = await query.order('period_year', { ascending: false }).order('period_month', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const writeCheck = await requireWritePermission(supabase, user.id)
  if (!writeCheck.ok) return writeCheck.response

  const companyId = await requireCompanyId(supabase, user.id)

  const validation = await validateBody(request, CreateSalaryRunSchema)
  if (!validation.success) return validation.response
  const body = validation.data

  // Check for existing run
  const { data: existing } = await supabase
    .from('salary_runs')
    .select('id')
    .eq('company_id', companyId)
    .eq('period_year', body.period_year)
    .eq('period_month', body.period_month)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Det finns redan en lönekörning för denna period' }, { status: 409 })
  }

  const { data: run, error } = await supabase
    .from('salary_runs')
    .insert({
      company_id: companyId,
      user_id: user.id,
      period_year: body.period_year,
      period_month: body.period_month,
      payment_date: body.payment_date,
      voucher_series: body.voucher_series,
      notes: body.notes || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await eventBus.emit({
    type: 'salary_run.created',
    payload: {
      salaryRunId: run.id,
      periodYear: body.period_year,
      periodMonth: body.period_month,
      userId: user.id,
      companyId,
    },
  })

  return NextResponse.json({ data: run }, { status: 201 })
}
