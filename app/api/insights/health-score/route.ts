import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { calculateFinancialHealth } from '@/lib/insights/financial-analysis'

/**
 * GET /api/insights/health-score
 * Get the financial health score for the authenticated user.
 */
export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  try {
    const healthScore = await calculateFinancialHealth(user.id, supabase)
    return NextResponse.json({ data: healthScore })
  } catch (error) {
    console.error('Health score calculation error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate health score' },
      { status: 500 }
    )
  }
}
