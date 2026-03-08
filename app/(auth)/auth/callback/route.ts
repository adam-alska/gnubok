import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/'

  // Collect cookies that Supabase sets during auth so we can
  // explicitly forward them on the redirect response.
  const pendingCookies: { name: string; value: string; options: Record<string, unknown> }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          pendingCookies.length = 0
          cookiesToSet.forEach((cookie) => pendingCookies.push(cookie))
        },
      },
    }
  )

  let authenticated = false

  // Handle PKCE flow (code exchange)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    authenticated = !error
  }
  // Handle token hash flow (email verification / magic link)
  else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email',
    })
    authenticated = !error
  }

  if (authenticated) {
    let redirectPath = next

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // Check MFA status — redirect to verify if factor is enrolled but session is AAL1
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.nextLevel === 'aal2' && aal?.currentLevel === 'aal1') {
        const response = NextResponse.redirect(new URL('/mfa/verify', origin))
        for (const { name, value, options } of pendingCookies) {
          response.cookies.set({ name, value, ...options })
        }
        return response
      }

      // Check if user has completed onboarding
      const { data: settings } = await supabase
        .from('company_settings')
        .select('onboarding_complete')
        .eq('user_id', user.id)
        .single()

      if (!settings?.onboarding_complete) {
        redirectPath = '/onboarding'
      }
    }

    // Create redirect and explicitly set auth cookies on the response
    const response = NextResponse.redirect(new URL(redirectPath, origin))
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set({ name, value, ...options })
    }
    return response
  }

  // Authentication failed — redirect to login with error
  return NextResponse.redirect(new URL('/login?error=auth_error', origin))
}
