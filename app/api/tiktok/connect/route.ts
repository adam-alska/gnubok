import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateOAuthState, getAuthorizationUrl } from '@/lib/tiktok/oauth'

export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Check if user already has an active TikTok account
    const { data: existingAccount } = await supabase
      .from('tiktok_accounts')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (existingAccount) {
      return NextResponse.json(
        { error: 'TikTok account already connected' },
        { status: 400 }
      )
    }

    // Generate OAuth state for CSRF protection and PKCE
    const { state, codeChallenge } = await generateOAuthState(user.id)

    // Get redirect URL
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/tiktok/callback`

    // Generate authorization URL with PKCE
    const authorizationUrl = getAuthorizationUrl(redirectUri, state, codeChallenge)

    return NextResponse.json({ authorization_url: authorizationUrl })
  } catch (error) {
    console.error('TikTok connect error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Connection failed' },
      { status: 500 }
    )
  }
}
