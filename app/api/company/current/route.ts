import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company/context'
import { NextResponse } from 'next/server'

/**
 * GET /api/company/current
 *
 * Returns the active company id for the authenticated user. Used by the
 * client-side CompanyTabSync listener to detect cross-tab divergence (e.g.
 * when a tab was hidden/backgrounded during a switch in another tab) and
 * force a hard reload on mismatch.
 *
 * Never cached — the whole point is that the response reflects the current
 * authoritative value in user_preferences.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      {
        status: 401,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    )
  }

  const companyId = await getActiveCompanyId(supabase, user.id)

  return NextResponse.json(
    { companyId },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
