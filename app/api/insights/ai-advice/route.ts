import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { generateAIInsight } from '@/lib/insights/ai-insights'

/**
 * POST /api/insights/ai-advice
 * Generate AI-powered financial advice.
 * Results are cached for 24 hours.
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
    const advice = await generateAIInsight(user.id, supabase)
    return NextResponse.json({ data: advice })
  } catch (error) {
    console.error('AI advice generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate AI advice' },
      { status: 500 }
    )
  }
}
