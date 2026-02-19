import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSRUCoverage } from '@/extensions/sru-export/sru-engine'

/**
 * GET /api/extensions/sru-export/coverage
 *
 * Returns SRU code coverage stats: how many accounts have SRU codes vs total,
 * and a list of accounts missing codes.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const coverage = await getSRUCoverage(user.id)
    return NextResponse.json({ data: coverage })
  } catch (err) {
    console.error('Error fetching SRU coverage:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch SRU coverage' },
      { status: 500 }
    )
  }
}
