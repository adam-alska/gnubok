import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { updateDeadlineStatuses } from '@/lib/deadlines/status-engine'
import { logger } from '@/lib/logger'

/**
 * GET /api/deadlines/status/cron
 * Daily cron job to update deadline statuses
 * Runs at 06:00 every day
 *
 * Vercel Cron: "0 6 * * *"
 */
export async function GET(request: Request) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Create a service role client for accessing all user data
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Missing Supabase configuration' },
      { status: 500 }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const result = await updateDeadlineStatuses(supabase)

    logger.info('deadline-status-cron', 'Deadline status cron completed', { updated: result.updated, newlyOverdue: result.newlyOverdue, newlyActionNeeded: result.newlyActionNeeded })

    return NextResponse.json({
      success: true,
      updated: result.updated,
      newlyOverdue: result.newlyOverdue,
      newlyActionNeeded: result.newlyActionNeeded,
    })
  } catch (error) {
    logger.error('deadline-status-cron', 'Error in deadline status cron', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json(
      { error: 'Failed to update deadline statuses' },
      { status: 500 }
    )
  }
}
