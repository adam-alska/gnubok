import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateOAuthState, exchangeCodeForTokens, calculateTokenExpiration } from '@/lib/tiktok/oauth'
import { encryptTokens } from '@/lib/tiktok/encryption'
import { getUserInfo } from '@/lib/tiktok/api'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/settings`

  // Handle OAuth errors
  if (error) {
    console.error('TikTok OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      `${redirectUrl}?tiktok_error=${encodeURIComponent(errorDescription || error)}`
    )
  }

  // Validate required parameters
  if (!code || !state) {
    return NextResponse.redirect(
      `${redirectUrl}?tiktok_error=${encodeURIComponent('Missing authorization code or state')}`
    )
  }

  // Validate state (CSRF protection) and get PKCE code verifier
  const stateData = await validateOAuthState(state)
  if (!stateData) {
    return NextResponse.redirect(
      `${redirectUrl}?tiktok_error=${encodeURIComponent('Invalid or expired state parameter')}`
    )
  }

  const { userId, codeVerifier } = stateData
  const supabase = await createClient()

  try {
    // Exchange code for tokens (with PKCE verifier)
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/tiktok/callback`
    const tokens = await exchangeCodeForTokens(code, redirectUri, codeVerifier)

    // Encrypt tokens
    const encryptedTokens = encryptTokens(tokens.access_token, tokens.refresh_token)

    // Calculate expiration dates
    const { tokenExpiresAt, refreshTokenExpiresAt } = calculateTokenExpiration(tokens)

    // Get user info from TikTok
    const userInfo = await getUserInfo({
      accessToken: tokens.access_token,
      userId,
    })

    // Check if account already exists (maybe in revoked/expired state)
    const { data: existingAccount } = await supabase
      .from('tiktok_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('tiktok_user_id', tokens.open_id)
      .single()

    if (existingAccount) {
      // Update existing account
      const { error: updateError } = await supabase
        .from('tiktok_accounts')
        .update({
          username: userInfo.username,
          display_name: userInfo.display_name,
          avatar_url: userInfo.avatar_url,
          ...encryptedTokens,
          token_expires_at: tokenExpiresAt.toISOString(),
          refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
          status: 'active',
          error_count: 0,
          last_error: null,
        })
        .eq('id', existingAccount.id)

      if (updateError) {
        throw updateError
      }
    } else {
      // Create new account
      const { error: insertError } = await supabase
        .from('tiktok_accounts')
        .insert({
          user_id: userId,
          tiktok_user_id: tokens.open_id,
          username: userInfo.username,
          display_name: userInfo.display_name,
          avatar_url: userInfo.avatar_url,
          ...encryptedTokens,
          token_expires_at: tokenExpiresAt.toISOString(),
          refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
          status: 'active',
        })

      if (insertError) {
        throw insertError
      }
    }

    return NextResponse.redirect(`${redirectUrl}?tiktok_connected=true`)
  } catch (error) {
    console.error('TikTok callback error:', error)
    return NextResponse.redirect(
      `${redirectUrl}?tiktok_error=${encodeURIComponent(
        error instanceof Error ? error.message : 'Failed to connect TikTok account'
      )}`
    )
  }
}
