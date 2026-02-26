import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { reverseEntry } from '@/lib/bookkeeping/engine'

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
    const reversalEntry = await reverseEntry(supabase, user.id, id)
    return NextResponse.json({ data: reversalEntry })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reverse entry' },
      { status: 400 }
    )
  }
}
