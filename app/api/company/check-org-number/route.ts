import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/**
 * GET /api/company/check-org-number?org_number=XXXXXXXXXX
 *
 * Returns `{ data: { exists: boolean } }` indicating whether the given
 * organisation number is already registered in any non-archived gnubok
 * company. Used by the onboarding wizard to warn users before they try to
 * create a duplicate.
 *
 * Requires authentication so the endpoint can't be used to enumerate the
 * full set of org numbers on the platform. Uses the service role internally
 * because RLS hides rows the caller isn't a member of — which is exactly
 * what we need to detect ("owned by someone else").
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const raw = url.searchParams.get('org_number') ?? ''
  const cleaned = raw.replace(/[\s-]/g, '')
  if (!cleaned) {
    return NextResponse.json({ error: 'org_number is required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('companies')
    .select('id')
    .eq('org_number', cleaned)
    .is('archived_at', null)
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { exists: !!data } })
}
