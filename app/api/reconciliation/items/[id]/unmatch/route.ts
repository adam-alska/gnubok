import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { unmatchTransaction } from '@/lib/reconciliation/reconciliation-engine'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  const { id } = await params

  try {
    await unmatchTransaction(user.id, id)

    return NextResponse.json({ data: { success: true } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kunde inte angra matchning' },
      { status: 400 }
    )
  }
}
