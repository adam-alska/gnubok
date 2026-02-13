import { createClient } from '@/lib/supabase/server'
import { decryptTokens, encryptTokens } from './encryption'
import { refreshAccessToken, shouldRefreshToken, isRefreshTokenExpired } from './oauth'
import { getUserInfo, getAllVideos, isTokenExpiredError } from './api'
import type { TikTokAccount, TikTokDailyStats, TikTokVideo, TikTokSyncType } from '@/types'

interface SyncResult {
  success: boolean
  statsSynced: boolean
  videosSynced: number
  newVideos: number
  error?: string
  errorCode?: string
}

/**
 * Ensure access token is valid, refresh if needed
 * Returns the valid access token or throws if unable to refresh
 */
export async function ensureValidToken(account: TikTokAccount): Promise<string> {
  const supabase = await createClient()

  // Get encrypted tokens from database
  const { data: fullAccount, error: fetchError } = await supabase
    .from('tiktok_accounts')
    .select('access_token_encrypted, refresh_token_encrypted')
    .eq('id', account.id)
    .single()

  if (fetchError || !fullAccount) {
    throw new Error('Failed to fetch account tokens')
  }

  const { access_token, refresh_token } = decryptTokens(
    fullAccount.access_token_encrypted,
    fullAccount.refresh_token_encrypted
  )

  const tokenExpiresAt = new Date(account.token_expires_at)
  const refreshTokenExpiresAt = new Date(account.refresh_token_expires_at)

  // Check if refresh token is expired
  if (isRefreshTokenExpired(refreshTokenExpiresAt)) {
    // Mark account as expired
    await supabase
      .from('tiktok_accounts')
      .update({ status: 'expired', last_error: 'Refresh token expired' })
      .eq('id', account.id)

    throw new Error('Refresh token expired - reconnection required')
  }

  // Check if access token needs refresh
  if (shouldRefreshToken(tokenExpiresAt)) {
    try {
      const newTokens = await refreshAccessToken(refresh_token)
      const encrypted = encryptTokens(newTokens.access_token, newTokens.refresh_token)

      const now = new Date()
      const newTokenExpiresAt = new Date(now.getTime() + newTokens.expires_in * 1000)
      const newRefreshExpiresAt = new Date(now.getTime() + newTokens.refresh_expires_in * 1000)

      await supabase
        .from('tiktok_accounts')
        .update({
          ...encrypted,
          token_expires_at: newTokenExpiresAt.toISOString(),
          refresh_token_expires_at: newRefreshExpiresAt.toISOString(),
          error_count: 0,
          last_error: null,
        })
        .eq('id', account.id)

      // Log the token refresh
      await supabase.from('tiktok_sync_logs').insert({
        tiktok_account_id: account.id,
        user_id: account.user_id,
        sync_type: 'token_refresh',
        status: 'success',
      })

      return newTokens.access_token
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token refresh failed'

      await supabase
        .from('tiktok_accounts')
        .update({
          status: 'error',
          last_error: errorMessage,
          error_count: account.error_count + 1,
        })
        .eq('id', account.id)

      throw error
    }
  }

  return access_token
}

/**
 * Sync daily stats for an account
 */
export async function syncDailyStats(account: TikTokAccount, accessToken: string): Promise<boolean> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  try {
    const userInfo = await getUserInfo({
      accessToken,
      userId: account.user_id,
    })

    // Insert or update daily stats
    const { error } = await supabase
      .from('tiktok_daily_stats')
      .upsert({
        tiktok_account_id: account.id,
        user_id: account.user_id,
        stats_date: today,
        follower_count: userInfo.follower_count,
        following_count: userInfo.following_count,
        likes_count: userInfo.likes_count,
        video_count: userInfo.video_count,
      }, {
        onConflict: 'tiktok_account_id,stats_date',
      })

    if (error) {
      console.error('Failed to save daily stats:', error)
      return false
    }

    // Update account with latest sync time
    await supabase
      .from('tiktok_accounts')
      .update({
        last_stats_sync_at: new Date().toISOString(),
        display_name: userInfo.display_name,
        avatar_url: userInfo.avatar_url,
      })
      .eq('id', account.id)

    return true
  } catch (error) {
    console.error('Failed to sync daily stats:', error)
    return false
  }
}

/**
 * Sync videos for an account
 */
export async function syncVideos(account: TikTokAccount, accessToken: string): Promise<{ synced: number; new: number }> {
  const supabase = await createClient()

  try {
    const videos = await getAllVideos({
      accessToken,
      userId: account.user_id,
    })

    let syncedCount = 0
    let newCount = 0

    for (const video of videos) {
      // Check if video already exists
      const { data: existing } = await supabase
        .from('tiktok_videos')
        .select('id')
        .eq('tiktok_account_id', account.id)
        .eq('tiktok_video_id', video.id)
        .single()

      const videoData = {
        tiktok_account_id: account.id,
        user_id: account.user_id,
        tiktok_video_id: video.id,
        title: video.title || video.video_description || null,
        share_url: video.share_url,
        cover_image_url: video.cover_image_url,
        view_count: video.view_count,
        like_count: video.like_count,
        comment_count: video.comment_count,
        share_count: video.share_count,
        duration: video.duration,
        published_at: new Date(video.create_time * 1000).toISOString(),
      }

      if (existing) {
        // Update existing video metrics
        await supabase
          .from('tiktok_videos')
          .update(videoData)
          .eq('id', existing.id)
      } else {
        // Insert new video
        await supabase.from('tiktok_videos').insert(videoData)
        newCount++
      }

      syncedCount++
    }

    // Update account with latest video sync time
    await supabase
      .from('tiktok_accounts')
      .update({ last_video_sync_at: new Date().toISOString() })
      .eq('id', account.id)

    return { synced: syncedCount, new: newCount }
  } catch (error) {
    console.error('Failed to sync videos:', error)
    return { synced: 0, new: 0 }
  }
}

/**
 * Full sync for an account
 */
export async function syncAccount(
  account: TikTokAccount,
  syncType: TikTokSyncType = 'full'
): Promise<SyncResult> {
  const supabase = await createClient()
  const result: SyncResult = {
    success: false,
    statsSynced: false,
    videosSynced: 0,
    newVideos: 0,
  }

  // Create sync log entry
  const { data: syncLog } = await supabase
    .from('tiktok_sync_logs')
    .insert({
      tiktok_account_id: account.id,
      user_id: account.user_id,
      sync_type: syncType,
      status: 'started',
    })
    .select()
    .single()

  try {
    // Ensure valid token
    const accessToken = await ensureValidToken(account)

    // Sync based on type
    if (syncType === 'full' || syncType === 'stats') {
      result.statsSynced = await syncDailyStats(account, accessToken)
    }

    if (syncType === 'full' || syncType === 'videos') {
      const videoResult = await syncVideos(account, accessToken)
      result.videosSynced = videoResult.synced
      result.newVideos = videoResult.new
    }

    result.success = true

    // Update sync log
    if (syncLog) {
      await supabase
        .from('tiktok_sync_logs')
        .update({
          status: 'success',
          stats_synced: result.statsSynced,
          videos_synced: result.videosSynced,
          new_videos: result.newVideos,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLog.id)
    }

    // Update account last synced
    await supabase
      .from('tiktok_accounts')
      .update({
        last_synced_at: new Date().toISOString(),
        status: 'active',
        error_count: 0,
        last_error: null,
      })
      .eq('id', account.id)

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorCode = isTokenExpiredError(error) ? 'token_expired' : 'sync_failed'

    result.error = errorMessage
    result.errorCode = errorCode

    // Update sync log
    if (syncLog) {
      await supabase
        .from('tiktok_sync_logs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          error_code: errorCode,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncLog.id)
    }

    // Update account error status
    await supabase
      .from('tiktok_accounts')
      .update({
        status: isTokenExpiredError(error) ? 'expired' : 'error',
        last_error: errorMessage,
        error_count: account.error_count + 1,
      })
      .eq('id', account.id)
  }

  return result
}

/**
 * Sync all active accounts (for cron job)
 */
export async function syncAllAccounts(): Promise<{
  total: number
  successful: number
  failed: number
}> {
  const supabase = await createClient()

  // Get all active accounts
  const { data: accounts, error } = await supabase
    .from('tiktok_accounts')
    .select('*')
    .eq('status', 'active')

  if (error || !accounts) {
    return { total: 0, successful: 0, failed: 0 }
  }

  let successful = 0
  let failed = 0

  for (const account of accounts) {
    const result = await syncAccount(account as TikTokAccount)
    if (result.success) {
      successful++
    } else {
      failed++
    }

    // Small delay between accounts
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  return { total: accounts.length, successful, failed }
}

/**
 * Refresh tokens for accounts expiring soon (for cron job)
 */
export async function refreshExpiringTokens(): Promise<number> {
  const supabase = await createClient()

  // Get accounts with tokens expiring in the next 6 hours
  const sixHoursFromNow = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()

  const { data: accounts, error } = await supabase
    .from('tiktok_accounts')
    .select('*')
    .eq('status', 'active')
    .lt('token_expires_at', sixHoursFromNow)

  if (error || !accounts) {
    return 0
  }

  let refreshed = 0

  for (const account of accounts) {
    try {
      await ensureValidToken(account as TikTokAccount)
      refreshed++
    } catch (error) {
      console.error(`Failed to refresh token for account ${account.id}:`, error)
    }

    // Small delay between refreshes
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  return refreshed
}
