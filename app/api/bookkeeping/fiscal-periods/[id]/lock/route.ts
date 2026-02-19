import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { lockPeriod } from '@/lib/core/bookkeeping/period-service'

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

  try {
    const period = await lockPeriod(user.id, id)
    return NextResponse.json({ data: period })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to lock period' },
      { status: 400 }
    )
  }
}
