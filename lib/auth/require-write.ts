import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActiveCompanyId } from '@/lib/company/context'

/**
 * Write-permission guard for API routes.
 *
 * Looks up the caller's role in the currently active company. Returns a
 * 403 JSON response if the role is 'viewer' (or if the user has no role
 * in any resolvable company). Any other role (owner / admin / member)
 * passes.
 *
 * Meant to be called AFTER `requireAuth()` in every API route that
 * mutates tenant data (POST / PATCH / PUT / DELETE). Read-only POSTs
 * that only generate PDFs or run utility lookups (e.g. VAT validation)
 * should skip this check.
 *
 * This is the application-layer half of the defense-in-depth story; the
 * RLS helper `public.current_user_can_write()` is the database half.
 * Having both means a viewer who bypasses the JS UI and calls the API
 * directly still gets a clean 403, and even if someone forgets to add
 * this guard to a new route, the RLS policy blocks the write at the
 * database layer.
 */
type WritePermissionResult =
  | { ok: true }
  | { ok: false; response: NextResponse }

export async function requireWritePermission(
  supabase: SupabaseClient,
  userId: string,
): Promise<WritePermissionResult> {
  const companyId = await getActiveCompanyId(supabase, userId)

  if (!companyId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Inget aktivt företag.' },
        { status: 403 },
      ),
    }
  }

  const { data: membership } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!membership || membership.role === 'viewer') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Du har endast läsbehörighet i detta företag.' },
        { status: 403 },
      ),
    }
  }

  return { ok: true }
}
