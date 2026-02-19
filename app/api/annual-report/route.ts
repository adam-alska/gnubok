import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateAnnualReport } from '@/lib/year-end/annual-report-generator'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/annual-report
 * List all annual reports for the current user
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { data, error } = await supabase
    .from('annual_reports')
    .select('*, fiscal_period:fiscal_periods(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * POST /api/annual-report
 * Generate an annual report from a completed year-end closing
 * Body: { year_end_closing_id: string }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const body = await request.json()
  const { year_end_closing_id } = body

  if (!year_end_closing_id) {
    return NextResponse.json({ error: 'year_end_closing_id kravs' }, { status: 400 })
  }

  try {
    const report = await generateAnnualReport(user.id, year_end_closing_id)
    return NextResponse.json({ data: report })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kunde inte generera arsredovisning' },
      { status: 500 }
    )
  }
}
