import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateBalanceSheet } from '@/lib/reports/balance-sheet'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('period_id')

  if (!periodId) {
    return NextResponse.json({ error: 'period_id is required' }, { status: 400 })
  }

  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('period_start, period_end')
    .eq('id', periodId)
    .eq('user_id', user.id)
    .single()

  try {
    const result = await generateBalanceSheet(supabase, user.id, periodId)

    if (period) {
      result.period = {
        start: period.period_start,
        end: period.period_end,
      }
    }

    return NextResponse.json({ data: result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate balance sheet' },
      { status: 500 }
    )
  }
}
