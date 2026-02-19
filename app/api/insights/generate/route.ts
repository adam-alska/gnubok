import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { generateInsights } from '@/lib/insights/insight-generator'

/**
 * POST /api/insights/generate
 * Regenerate financial insights for the authenticated user.
 */
export async function POST() {
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
    const insights = await generateInsights(user.id, supabase)
    return NextResponse.json({ data: insights })
  } catch (error) {
    console.error('Failed to generate insights:', error)
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    )
  }
}
