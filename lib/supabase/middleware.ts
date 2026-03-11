import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isMfaRequired } from '@/lib/auth/mfa'

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
    pathname.startsWith('/sandbox')
  ) {
    // If user is logged in and trying to access auth pages, redirect to dashboard or onboarding
    if (user) {
      const { data: settings } = await supabase
        .from('company_settings')
        .select('onboarding_complete')
        .eq('user_id', user.id)
        .single()

      if (!settings?.onboarding_complete) {
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }

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
  if (isMfaRequired()) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    // User has MFA enrolled but hasn't verified this session → redirect to verify
    if (aal?.nextLevel === 'aal2' && aal?.currentLevel === 'aal1') {
      return NextResponse.redirect(new URL('/mfa/verify', request.url))
    }

    // MFA required but user has no factor enrolled yet → force enrollment
    // (skip during onboarding — let them finish setup first)
    if (!pathname.startsWith('/onboarding')) {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const hasVerifiedFactor = factors?.totp?.some(f => f.status === 'verified')

      if (!hasVerifiedFactor) {
        return NextResponse.redirect(new URL('/mfa/enroll', request.url))
      }
    }
  }

  // Onboarding route - only accessible if not complete
  if (pathname.startsWith('/onboarding')) {
    const { data: settings } = await supabase
      .from('company_settings')
      .select('onboarding_complete')
      .eq('user_id', user.id)
      .single()

    // If onboarding is complete, redirect to dashboard
    if (settings?.onboarding_complete) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    return supabaseResponse
  }

  // Dashboard routes - require completed onboarding
  const { data: settings } = await supabase
    .from('company_settings')
    .select('onboarding_complete')
    .eq('user_id', user.id)
    .single()

  // If no settings or onboarding not complete, redirect to onboarding
  if (!settings?.onboarding_complete) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  return supabaseResponse
}
