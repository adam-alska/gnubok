import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, CopyFromActualSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { createBudgetFromPreviousYear } from '@/lib/budget/budget-engine'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: budgetId } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  // Verify budget ownership and not locked
  const { data: budget, error: budgetError } = await supabase
    .from('budgets')
    .select('id, status')
    .eq('id', budgetId)
    .eq('user_id', user.id)
    .single()

  if (budgetError || !budget) {
    return NextResponse.json({ error: 'Budget hittades inte' }, { status: 404 })
  }

  if (budget.status === 'locked') {
    return NextResponse.json({ error: 'Budgeten är låst' }, { status: 403 })
  }

  const raw = await request.json()
  const validation = validateBody(CopyFromActualSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  // Verify source fiscal period belongs to user
  const { data: sourcePeriod, error: spError } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('id', body.source_fiscal_period_id)
    .eq('user_id', user.id)
    .single()

  if (spError || !sourcePeriod) {
    return NextResponse.json({ error: 'Källperiod hittades inte' }, { status: 404 })
  }

  try {
    const result = await createBudgetFromPreviousYear(
      body.source_fiscal_period_id,
      budgetId,
      body.adjustment_percent,
      supabase
    )

    return NextResponse.json({
      data: result,
      message: `${result.created} budgetposter skapade från föregående års utfall`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
