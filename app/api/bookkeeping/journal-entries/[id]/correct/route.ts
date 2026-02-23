import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { correctEntry } from '@/lib/core/bookkeeping/storno-service'
import { ensureInitialized } from '@/lib/init'
import type { CreateJournalEntryLineInput } from '@/types'

ensureInitialized()

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

  let body: { lines: CreateJournalEntryLineInput[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: 'Lines are required' }, { status: 400 })
  }

  try {
    const result = await correctEntry(user.id, id, body.lines)
    return NextResponse.json({ data: result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to correct entry' },
      { status: 400 }
    )
  }
}
