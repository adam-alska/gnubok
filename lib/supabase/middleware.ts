import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { shouldEnforceMfa } from '@/lib/auth/mfa'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  // Get the pathname
  const pathname = request.nextUrl.pathname

  // If the refresh token is stale/invalid, clear the session cookies
  // so the browser stops sending them on every request.
  // Skip on auth routes — the callback needs PKCE cookies intact.
  if (authError && !user && !pathname.startsWith('/auth')) {
    await supabase.auth.signOut()
  }

  // Public auth routes — allow access
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/sandbox') ||
    pathname.startsWith('/invite')
  ) {
    // If user is logged in and trying to access auth pages, redirect to dashboard
    if (user) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return supabaseResponse
  }

  // Protected routes - require authentication
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // MFA pages — accessible to authenticated users (AAL1+), skip MFA enforcement
  if (pathname.startsWith('/mfa/')) {
    return supabaseResponse
  }

  // MFA enforcement (application-side only, not RLS)
  if (shouldEnforceMfa(user)) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    // User has MFA enrolled but hasn't verified this session → redirect to verify
    if (aal?.nextLevel === 'aal2' && aal?.currentLevel === 'aal1') {
      return NextResponse.redirect(new URL('/mfa/verify', request.url))
    }

    // MFA required but user has no factor enrolled yet → force enrollment
    // Skip for users with no companies (still setting up)
    const companyIdForMfa = await resolveCompanyForMiddleware(supabase, user.id, request)
    if (companyIdForMfa) {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const hasVerifiedFactor = factors?.totp?.some(f => f.status === 'verified')

      if (!hasVerifiedFactor) {
        return NextResponse.redirect(new URL('/mfa/enroll', request.url))
      }
    }
  }

  // Company context resolution
  const companyId = await resolveCompanyForMiddleware(supabase, user.id, request)

  // No companies — only allow /onboarding, redirect everything else there
  if (!companyId) {
    if (pathname.startsWith('/onboarding')) {
      return supabaseResponse
    }
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  // Set company cookie on the response so downstream requests have it
  supabaseResponse.cookies.set('gnubok-company-id', companyId, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })

  // Allow access to onboarding (for adding new companies), select-company, and companies/new
  if (pathname.startsWith('/select-company') || pathname.startsWith('/companies/new') || pathname.startsWith('/onboarding')) {
    return supabaseResponse
  }

  return supabaseResponse
}

/**
 * Resolve the active company for the authenticated user.
 * Uses cookie → user_preferences → first membership as fallback.
 * Cannot use lib/company/context.ts because middleware runs on Edge.
 */
async function resolveCompanyForMiddleware(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  request: NextRequest
): Promise<string | null> {
  // 1. Try cookie
  const cookieCompanyId = request.cookies.get('gnubok-company-id')?.value
  if (cookieCompanyId) {
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('company_id', cookieCompanyId)
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
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('company_id', prefs.active_company_id)
      .eq('user_id', userId)
      .single()

    if (membership) return membership.company_id
  }

  // 3. Fallback: first company membership
  const { data: firstCompany } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  return firstCompany?.company_id ?? null
}
