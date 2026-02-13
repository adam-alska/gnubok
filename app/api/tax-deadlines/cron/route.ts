import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { generateNewYearDeadlines } from '@/lib/tax/deadline-generator'

/**
 * GET /api/tax-deadlines/cron
 * Annual cron job to generate tax deadlines for the new year
 * Runs on January 2nd
 *
 * Vercel Cron: "0 0 2 1 *" (midnight on January 2nd)
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
    const result = await generateNewYearDeadlines(supabase)

    console.log(`Tax deadlines cron completed: ${result.usersProcessed} users, ${result.totalCreated} deadlines created`)

    return NextResponse.json({
      success: true,
      usersProcessed: result.usersProcessed,
      totalCreated: result.totalCreated,
    })
  } catch (error) {
    console.error('Error in tax deadlines cron:', error)
    return NextResponse.json(
      { error: 'Failed to generate tax deadlines' },
      { status: 500 }
    )
  }
}
