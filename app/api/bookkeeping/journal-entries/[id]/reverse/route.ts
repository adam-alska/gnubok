import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { reverseEntry } from '@/lib/bookkeeping/engine'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  try {
    const reversalEntry = await reverseEntry(user.id, id)
    return NextResponse.json({ data: reversalEntry })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reverse entry' },
      { status: 400 }
    )
  }
}
