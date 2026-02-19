import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, CreateBudgetInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { data, error } = await supabase
    .from('budgets')
    .select(`
      *,
      fiscal_period:fiscal_periods(id, name, period_start, period_end)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch entry counts per budget
  const budgetIds = (data || []).map(b => b.id)
  let entryCounts: Record<string, number> = {}

  if (budgetIds.length > 0) {
    const { data: counts } = await supabase
      .from('budget_entries')
      .select('budget_id')
      .in('budget_id', budgetIds)

    if (counts) {
      entryCounts = counts.reduce((acc: Record<string, number>, entry: { budget_id: string }) => {
        acc[entry.budget_id] = (acc[entry.budget_id] || 0) + 1
        return acc
      }, {})
    }
  }

  const enrichedData = (data || []).map(budget => ({
    ...budget,
    entries_count: entryCounts[budget.id] || 0,
  }))

  return NextResponse.json({ data: enrichedData })
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
  const validation = validateBody(CreateBudgetInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  // Verify fiscal period exists and belongs to user
  const { data: period, error: periodError } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('id', body.fiscal_period_id)
    .eq('user_id', user.id)
    .single()

  if (periodError || !period) {
    return NextResponse.json({ error: 'Räkenskapsperiod hittades inte' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('budgets')
    .insert({
      user_id: user.id,
      name: body.name,
      fiscal_period_id: body.fiscal_period_id,
      status: body.status || 'draft',
      description: body.description,
    })
    .select(`
      *,
      fiscal_period:fiscal_periods(id, name, period_start, period_end)
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { ...data, entries_count: 0 } })
}
