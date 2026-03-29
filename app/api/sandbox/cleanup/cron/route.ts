import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/auth/cron'

/**
 * GET /api/sandbox/cleanup/cron
 * Daily cron job to clean up expired sandbox users (>24h old).
 * Runs at 04:00 UTC every day.
 */
export async function GET(request: Request) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

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
    const { data, error } = await supabase.rpc('cleanup_expired_sandbox_users', {
      p_max_age_hours: 24,
    })

    if (error) throw error

    const cleaned = data ?? 0
    console.log(`Sandbox cleanup cron completed: ${cleaned} users removed`)

    return NextResponse.json({ success: true, cleaned })
  } catch (error) {
    console.error('Error in sandbox cleanup cron:', error)
    return NextResponse.json(
      { error: 'Failed to clean up sandbox users' },
      { status: 500 }
    )
  }
}
