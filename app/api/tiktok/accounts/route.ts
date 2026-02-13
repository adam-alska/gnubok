import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get user's TikTok accounts (exclude encrypted tokens)
    const { data: accounts, error } = await supabase
      .from('tiktok_accounts')
      .select(`
        id,
        tiktok_user_id,
        username,
        display_name,
        avatar_url,
        token_expires_at,
        refresh_token_expires_at,
        status,
        last_synced_at,
        last_stats_sync_at,
        last_video_sync_at,
        last_error,
        error_count,
        created_at,
        updated_at
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    return NextResponse.json({ accounts: accounts || [] })
  } catch (error) {
    console.error('Error fetching TikTok accounts:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch accounts' },
      { status: 500 }
    )
  }
}
