import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { syncAccount } from '@/lib/tiktok/sync'
import type { TikTokAccount, TikTokSyncType } from '@/types'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { account_id, sync_type = 'full' } = await request.json()

  if (!account_id) {
    return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
  }

  // Validate sync_type
  const validSyncTypes: TikTokSyncType[] = ['stats', 'videos', 'full']
  if (!validSyncTypes.includes(sync_type)) {
    return NextResponse.json(
      { error: 'Invalid sync_type. Must be one of: stats, videos, full' },
      { status: 400 }
    )
  }

  try {
    // Get account
    const { data: account, error: fetchError } = await supabase
      .from('tiktok_accounts')
      .select('*')
      .eq('id', account_id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Check if account is in a valid state for syncing
    if (account.status === 'revoked') {
      return NextResponse.json(
        { error: 'Account has been disconnected' },
        { status: 400 }
      )
    }

    // Perform sync
    const result = await syncAccount(account as TikTokAccount, sync_type)

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || 'Sync failed',
          errorCode: result.errorCode,
          partial: result.statsSynced || result.videosSynced > 0,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      stats_synced: result.statsSynced,
      videos_synced: result.videosSynced,
      new_videos: result.newVideos,
    })
  } catch (error) {
    console.error('TikTok sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
