import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { createSalaryJournalEntry } from '@/lib/payroll/payroll-booking'

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

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  // Verify ownership
  const { data: run } = await supabase
    .from('salary_runs')
    .select('user_id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!run) {
    return NextResponse.json({ error: 'Lönekörning hittades inte' }, { status: 404 })
  }

  if (run.status !== 'calculated') {
    return NextResponse.json(
      { error: 'Lönekörningen måste vara beräknad innan den kan godkännas' },
      { status: 400 }
    )
  }

  try {
    const journalEntryId = await createSalaryJournalEntry(id, supabase)
    return NextResponse.json({
      data: {
        approved: true,
        journal_entry_id: journalEntryId,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Godkannande misslyckades' },
      { status: 400 }
    )
  }
}
