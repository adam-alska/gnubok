import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * GET /api/health
 * Public health check endpoint (no auth required).
 * Returns DB connectivity status for uptime monitoring.
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { status: 'unhealthy', timestamp: new Date().toISOString(), version: '1.0.0', error: 'Missing configuration' },
      { status: 503 }
    )
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { error } = await supabase
      .from('fiscal_periods')
      .select('id', { count: 'exact', head: true })
      .limit(1)

    if (error) {
      return NextResponse.json(
        { status: 'unhealthy', timestamp: new Date().toISOString(), version: '1.0.0', error: error.message },
        { status: 503 }
      )
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    })
  } catch (err) {
    return NextResponse.json(
      { status: 'unhealthy', timestamp: new Date().toISOString(), version: '1.0.0', error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 503 }
    )
  }
}
