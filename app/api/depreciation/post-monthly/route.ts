import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, PostMonthlyDepreciationSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { postMonthlyDepreciation } from '@/lib/assets/depreciation-engine'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, remaining, reset: rlReset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(rlReset)

  const raw = await request.json()
  const validation = validateBody(PostMonthlyDepreciationSchema, raw)
  if (!validation.success) return validation.response
  const { year, month } = validation.data

  try {
    const result = await postMonthlyDepreciation(year, month, supabase)
    return NextResponse.json({ data: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Kunde inte bokföra avskrivningar'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
