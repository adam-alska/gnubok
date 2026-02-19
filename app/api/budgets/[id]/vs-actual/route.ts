import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { calculateBudgetVsActual, generateBudgetVsActualCSV } from '@/lib/budget/budget-engine'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: budgetId } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  // Verify budget ownership
  const { data: budget, error: budgetError } = await supabase
    .from('budgets')
    .select('id')
    .eq('id', budgetId)
    .eq('user_id', user.id)
    .single()

  if (budgetError || !budget) {
    return NextResponse.json({ error: 'Budget hittades inte' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const format = searchParams.get('format')

  try {
    const report = await calculateBudgetVsActual(budgetId, supabase)

    if (format === 'csv') {
      const csv = generateBudgetVsActualCSV(report)
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="budget-vs-utfall-${budgetId}.csv"`,
        },
      })
    }

    return NextResponse.json({ data: report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
