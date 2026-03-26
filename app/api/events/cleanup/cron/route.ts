import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/events/cleanup/cron
 * Daily cron job to delete event_log rows older than 30 days.
 * Runs at 02:00 UTC every day.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = await createServiceClient()

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)

    const { error, count } = await supabase
      .from('event_log')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff.toISOString())

    if (error) throw error

    const deleted = count ?? 0
    console.log(`Event log cleanup completed: ${deleted} events removed`)

    return NextResponse.json({ success: true, deleted })
  } catch (error) {
    console.error('Error in event log cleanup cron:', error)
    return NextResponse.json(
      { error: 'Failed to clean up event log' },
      { status: 500 }
    )
  }
}
