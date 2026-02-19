import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { takeKPISnapshot } from '@/lib/insights/snapshot-cron'

/**
 * GET /api/insights/snapshot/cron
 * Cron job endpoint to take KPI snapshots for all users.
 * Should be called daily by Vercel Cron or similar scheduler.
 * Protected by CRON_SECRET.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = await createServiceClient()
    const result = await takeKPISnapshot(supabase)

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('KPI snapshot cron error:', error)
    return NextResponse.json(
      { error: 'Snapshot cron job failed' },
      { status: 500 }
    )
  }
}
