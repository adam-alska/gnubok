import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const COMPANY_COOKIE = 'gnubok-company-id'

/**
 * Get the active company ID for the authenticated user.
 * Resolution order: cookie → user_preferences → first owned company.
 * Returns null if user has no companies.
 */
export async function getActiveCompanyId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  // 1. Try cookie
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(COMPANY_COOKIE)?.value

  if (cookieValue) {
    // Validate the user is a member of this company
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('company_id', cookieValue)
      .eq('user_id', userId)
      .single()

    if (membership) return membership.company_id
  }

  // 2. Try user_preferences
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('active_company_id')
    .eq('user_id', userId)
    .single()

  if (prefs?.active_company_id) {
    // Validate membership
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('company_id', prefs.active_company_id)
      .eq('user_id', userId)
      .single()

    if (membership) return membership.company_id
  }

  // 3. Fallback: first company where user is owner (or any member)
  const { data: firstCompany } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  return firstCompany?.company_id ?? null
}

/**
 * Get all companies the user is a member of, with their roles.
 */
export async function getUserCompanies(
  supabase: SupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('company_members')
    .select(`
      company_id,
      role,
      joined_at,
      companies:company_id (
        id,
        name,
        org_number,
        entity_type,
        archived_at,
        created_at
      )
    `)
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Set the active company for the user (updates cookie + user_preferences).
 */
export async function setActiveCompany(
  supabase: SupabaseClient,
  userId: string,
  companyId: string
): Promise<void> {
  // Validate membership
  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .single()

  if (!membership) {
    throw new Error('User is not a member of this company')
  }

  // Update user_preferences
  await supabase
    .from('user_preferences')
    .upsert(
      { user_id: userId, active_company_id: companyId },
      { onConflict: 'user_id' }
    )

  // Set cookie
  const cookieStore = await cookies()
  cookieStore.set(COMPANY_COOKIE, companyId, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  })
}

/**
 * Get the active company ID for API routes.
 * Throws if no company context can be resolved.
 */
export async function requireCompanyId(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const companyId = await getActiveCompanyId(supabase, userId)
  if (!companyId) {
    throw new Error('No company context')
  }
  return companyId
}
