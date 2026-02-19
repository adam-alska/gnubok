import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { getMonthlyDepreciationPreview } from '@/lib/assets/depreciation-engine'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year')
  const monthParam = searchParams.get('month')

  if (!yearParam || !monthParam) {
    return NextResponse.json(
      { error: 'Parametrar year och month krävs' },
      { status: 400 }
    )
  }

  const year = parseInt(yearParam, 10)
  const month = parseInt(monthParam, 10)

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json(
      { error: 'Ogiltiga parametrar' },
      { status: 400 }
    )
  }

  try {
    const preview = await getMonthlyDepreciationPreview(year, month, supabase)
    const totalAmount = preview.reduce((sum, p) => sum + p.depreciation_amount, 0)

    return NextResponse.json({
      data: {
        entries: preview,
        total_amount: Math.round(totalAmount * 100) / 100,
        count: preview.length,
        period: `${year}-${String(month).padStart(2, '0')}`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Kunde inte hämta förhandsgranskning'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
