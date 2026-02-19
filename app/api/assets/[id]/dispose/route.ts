import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, AssetDisposalInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { disposeAsset } from '@/lib/assets/depreciation-engine'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, remaining, reset: rlReset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(rlReset)

  const raw = await request.json()
  const validation = validateBody(AssetDisposalInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const result = await disposeAsset(id, body, supabase)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    data: {
      success: true,
      journal_entry_id: result.journal_entry_id,
    },
  })
}
