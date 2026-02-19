import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { generateCashFlowForecast } from '@/lib/insights/financial-analysis'

/**
 * GET /api/insights/cash-flow
 * Get cash flow forecast for the authenticated user.
 * Query params:
 *   - days: number of days to forecast (default: 90, max: 180)
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { searchParams } = new URL(request.url)
  const days = Math.min(180, Math.max(7, parseInt(searchParams.get('days') || '90')))

  try {
    const forecast = await generateCashFlowForecast(user.id, days, supabase)
    return NextResponse.json({ data: forecast })
  } catch (error) {
    console.error('Cash flow forecast error:', error)
    return NextResponse.json(
      { error: 'Failed to generate cash flow forecast' },
      { status: 500 }
    )
  }
}
