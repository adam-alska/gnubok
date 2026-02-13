import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revokeToken } from '@/lib/tiktok/oauth'
import { decryptToken } from '@/lib/tiktok/encryption'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { account_id } = await request.json()

  if (!account_id) {
    return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
  }

  try {
    // Get account with encrypted token
    const { data: account, error: fetchError } = await supabase
      .from('tiktok_accounts')
      .select('id, user_id, access_token_encrypted')
      .eq('id', account_id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Try to revoke token with TikTok (best effort)
    try {
      const accessToken = decryptToken(account.access_token_encrypted)
      await revokeToken(accessToken)
    } catch (revokeError) {
      // Log but don't fail - we'll still mark as revoked locally
      console.error('Failed to revoke TikTok token:', revokeError)
    }

    // Update account status to revoked
    const { error: updateError } = await supabase
      .from('tiktok_accounts')
      .update({ status: 'revoked' })
      .eq('id', account_id)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('TikTok disconnect error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Disconnect failed' },
      { status: 500 }
    )
  }
}
