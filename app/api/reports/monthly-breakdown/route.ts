import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateMonthlyBreakdown } from '@/lib/reports/monthly-breakdown'

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

  try {
    const data = await generateMonthlyBreakdown(supabase, user.id, periodId)
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Failed to generate monthly breakdown' }, { status: 500 })
  }
}
