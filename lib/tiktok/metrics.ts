import { createClient } from '@/lib/supabase/server'
import type {
  TikTokVideo,
  TikTokDailyStats,
  TikTokEngagementMetrics,
  TikTokCampaignROI,
  TikTokFollowerGrowth,
  TikTokStatsSummary,
} from '@/types'

/**
 * Calculate engagement metrics for a set of videos
 */
export function calculateEngagementMetrics(videos: TikTokVideo[]): TikTokEngagementMetrics {
  if (videos.length === 0) {
    return {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      engagementRate: 0,
    }
  }

  const totals = videos.reduce(
    (acc, video) => ({
      views: acc.views + video.view_count,
      likes: acc.likes + video.like_count,
      comments: acc.comments + video.comment_count,
      shares: acc.shares + video.share_count,
    }),
    { views: 0, likes: 0, comments: 0, shares: 0 }
  )

  // Engagement rate = (likes + comments + shares) / views * 100
  const totalEngagements = totals.likes + totals.comments + totals.shares
  const engagementRate = totals.views > 0 ? (totalEngagements / totals.views) * 100 : 0

  return {
    ...totals,
    engagementRate: Math.round(engagementRate * 100) / 100, // Round to 2 decimals
  }
}

/**
 * Calculate campaign ROI based on linked videos and invoices
 */
export async function calculateCampaignROI(campaignId: string): Promise<TikTokCampaignROI | null> {
  const supabase = await createClient()

  // Get campaign with invoices
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select(`
      id,
      name,
      invoices!inner (
        total_sek,
        status
      )
    `)
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaign) {
    return null
  }

  // Get linked videos
  const { data: videos, error: videosError } = await supabase
    .from('tiktok_videos')
    .select('*')
    .eq('campaign_id', campaignId)

  if (videosError || !videos) {
    return null
  }

  // Calculate total cost from paid invoices
  const totalCost = (campaign.invoices as { total_sek: number; status: string }[])
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + (inv.total_sek || 0), 0)

  // Calculate engagement metrics
  const metrics = calculateEngagementMetrics(videos as TikTokVideo[])

  return {
    campaignId,
    campaignName: campaign.name,
    totalCost,
    totalViews: metrics.views,
    totalEngagements: metrics.likes + metrics.comments + metrics.shares,
    costPerView: metrics.views > 0 ? totalCost / metrics.views : 0,
    costPerEngagement:
      metrics.likes + metrics.comments + metrics.shares > 0
        ? totalCost / (metrics.likes + metrics.comments + metrics.shares)
        : 0,
    videos: videos as TikTokVideo[],
  }
}

/**
 * Calculate follower growth for a period
 */
export async function calculateFollowerGrowth(
  accountId: string,
  period: TikTokFollowerGrowth['period']
): Promise<TikTokFollowerGrowth | null> {
  const supabase = await createClient()

  // Calculate date range
  const endDate = new Date()
  const startDate = new Date()

  switch (period) {
    case '7d':
      startDate.setDate(startDate.getDate() - 7)
      break
    case '30d':
      startDate.setDate(startDate.getDate() - 30)
      break
    case '90d':
      startDate.setDate(startDate.getDate() - 90)
      break
    case '1y':
      startDate.setFullYear(startDate.getFullYear() - 1)
      break
  }

  // Get stats for the period
  const { data: stats, error } = await supabase
    .from('tiktok_daily_stats')
    .select('stats_date, follower_count')
    .eq('tiktok_account_id', accountId)
    .gte('stats_date', startDate.toISOString().split('T')[0])
    .lte('stats_date', endDate.toISOString().split('T')[0])
    .order('stats_date', { ascending: true })

  if (error || !stats || stats.length < 2) {
    return null
  }

  const startStats = stats[0]
  const endStats = stats[stats.length - 1]
  const daysDiff = Math.ceil(
    (new Date(endStats.stats_date).getTime() - new Date(startStats.stats_date).getTime()) /
      (1000 * 60 * 60 * 24)
  )

  const change = endStats.follower_count - startStats.follower_count
  const changePercent =
    startStats.follower_count > 0
      ? (change / startStats.follower_count) * 100
      : 0
  const dailyAverage = daysDiff > 0 ? change / daysDiff : 0

  return {
    period,
    startCount: startStats.follower_count,
    endCount: endStats.follower_count,
    change,
    changePercent: Math.round(changePercent * 100) / 100,
    dailyAverage: Math.round(dailyAverage * 100) / 100,
  }
}

/**
 * Get stats summary for dashboard
 */
export async function getStatsSummary(userId: string): Promise<TikTokStatsSummary | null> {
  const supabase = await createClient()

  // Get active account
  const { data: account, error: accountError } = await supabase
    .from('tiktok_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single()

  if (accountError || !account) {
    return null
  }

  // Get latest stats
  const { data: latestStats } = await supabase
    .from('tiktok_daily_stats')
    .select('*')
    .eq('tiktok_account_id', account.id)
    .order('stats_date', { ascending: false })
    .limit(1)
    .single()

  // Get growth data
  const growth7d = await calculateFollowerGrowth(account.id, '7d')
  const growth30d = await calculateFollowerGrowth(account.id, '30d')

  // Get recent videos
  const { data: recentVideos } = await supabase
    .from('tiktok_videos')
    .select('*')
    .eq('tiktok_account_id', account.id)
    .order('published_at', { ascending: false })
    .limit(5)

  // Calculate engagement rate from recent videos
  const metrics = calculateEngagementMetrics((recentVideos || []) as TikTokVideo[])

  return {
    currentFollowers: latestStats?.follower_count || 0,
    followerChange7d: growth7d?.change || 0,
    followerChange30d: growth30d?.change || 0,
    totalLikes: latestStats?.likes_count || 0,
    totalVideos: latestStats?.video_count || 0,
    recentVideos: (recentVideos || []) as TikTokVideo[],
    engagementRate: metrics.engagementRate,
    lastSynced: account.last_synced_at,
  }
}

/**
 * Get follower history for chart
 */
export async function getFollowerHistory(
  accountId: string,
  days: number = 30
): Promise<{ date: string; followers: number; change: number | null }[]> {
  const supabase = await createClient()

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const { data: stats, error } = await supabase
    .from('tiktok_daily_stats')
    .select('stats_date, follower_count, follower_change')
    .eq('tiktok_account_id', accountId)
    .gte('stats_date', startDate.toISOString().split('T')[0])
    .order('stats_date', { ascending: true })

  if (error || !stats) {
    return []
  }

  return stats.map(stat => ({
    date: stat.stats_date,
    followers: stat.follower_count,
    change: stat.follower_change,
  }))
}

/**
 * Get video performance data for a period
 */
export async function getVideoPerformance(
  accountId: string,
  days: number = 30
): Promise<TikTokVideo[]> {
  const supabase = await createClient()

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const { data: videos, error } = await supabase
    .from('tiktok_videos')
    .select('*')
    .eq('tiktok_account_id', accountId)
    .gte('published_at', startDate.toISOString())
    .order('published_at', { ascending: false })

  if (error || !videos) {
    return []
  }

  return videos as TikTokVideo[]
}

/**
 * Get campaigns with TikTok ROI data
 */
export async function getCampaignsWithROI(userId: string): Promise<TikTokCampaignROI[]> {
  const supabase = await createClient()

  // Get campaigns with linked TikTok videos
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id')
    .eq('user_id', userId)
    .not('id', 'is', null)

  if (error || !campaigns) {
    return []
  }

  // Get campaigns that have linked videos
  const { data: videoCampaigns } = await supabase
    .from('tiktok_videos')
    .select('campaign_id')
    .eq('user_id', userId)
    .not('campaign_id', 'is', null)

  if (!videoCampaigns) {
    return []
  }

  const uniqueCampaignIds = [...new Set(videoCampaigns.map(v => v.campaign_id))]

  const roiData: TikTokCampaignROI[] = []
  for (const campaignId of uniqueCampaignIds) {
    if (campaignId) {
      const roi = await calculateCampaignROI(campaignId)
      if (roi) {
        roiData.push(roi)
      }
    }
  }

  return roiData
}
