import {
  TIKTOK_API_ENDPOINTS,
  type TikTokApiResponse,
  type TikTokUserInfoResponse,
  type TikTokVideoListResponse,
  type TikTokVideoData,
} from './types'
import { checkRateLimit, waitForRateLimit } from './rate-limiter'

interface TikTokApiOptions {
  accessToken: string
  userId: string
}

class TikTokApiError extends Error {
  code: string
  logId?: string

  constructor(message: string, code: string, logId?: string) {
    super(message)
    this.name = 'TikTokApiError'
    this.code = code
    this.logId = logId
  }
}

/**
 * Make an authenticated request to the TikTok API
 */
async function makeRequest<T>(
  endpoint: string,
  options: TikTokApiOptions,
  params?: Record<string, string>,
  body?: Record<string, unknown>
): Promise<T> {
  // Check rate limit
  if (!checkRateLimit(options.userId)) {
    await waitForRateLimit(options.userId)
  }

  const url = new URL(endpoint)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value)
    })
  }

  const requestOptions: RequestInit = {
    headers: {
      'Authorization': `Bearer ${options.accessToken}`,
      'Content-Type': 'application/json',
    },
  }

  if (body) {
    requestOptions.method = 'POST'
    requestOptions.body = JSON.stringify(body)
  }

  const response = await fetch(url.toString(), requestOptions)
  const data: TikTokApiResponse<T> = await response.json()

  if (data.error && data.error.code !== 'ok') {
    throw new TikTokApiError(
      data.error.message,
      data.error.code,
      data.error.log_id
    )
  }

  return data.data
}

/**
 * Fetch user info (profile and stats)
 */
export async function getUserInfo(options: TikTokApiOptions): Promise<TikTokUserInfoResponse['user']> {
  const response = await makeRequest<TikTokUserInfoResponse>(
    TIKTOK_API_ENDPOINTS.userInfo,
    options,
    {
      fields: 'open_id,union_id,avatar_url,avatar_url_100,avatar_large_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count,username',
    }
  )

  return response.user
}

/**
 * Fetch video list with pagination
 */
export async function getVideoList(
  options: TikTokApiOptions,
  cursor?: number,
  maxCount: number = 20
): Promise<TikTokVideoListResponse> {
  const body: Record<string, unknown> = {
    max_count: Math.min(maxCount, 20), // API limit is 20
  }

  if (cursor) {
    body.cursor = cursor
  }

  return makeRequest<TikTokVideoListResponse>(
    TIKTOK_API_ENDPOINTS.videoList,
    options,
    {
      fields: 'id,title,video_description,duration,cover_image_url,share_url,embed_link,embed_html,create_time,like_count,comment_count,share_count,view_count',
    },
    body
  )
}

/**
 * Fetch all videos (with pagination)
 */
export async function getAllVideos(
  options: TikTokApiOptions,
  maxVideos: number = 100
): Promise<TikTokVideoData[]> {
  const allVideos: TikTokVideoData[] = []
  let cursor: number | undefined
  let hasMore = true

  while (hasMore && allVideos.length < maxVideos) {
    const response = await getVideoList(options, cursor)
    allVideos.push(...response.videos)
    hasMore = response.has_more
    cursor = response.cursor

    // Small delay to be nice to the API
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return allVideos.slice(0, maxVideos)
}

/**
 * Check if a TikTok API error indicates token expiration
 */
export function isTokenExpiredError(error: unknown): boolean {
  if (error instanceof TikTokApiError) {
    return (
      error.code === 'invalid_access_token' ||
      error.code === 'access_token_expired'
    )
  }
  return false
}

/**
 * Check if a TikTok API error indicates refresh token expiration
 */
export function isRefreshTokenExpiredError(error: unknown): boolean {
  if (error instanceof TikTokApiError) {
    return error.code === 'refresh_token_expired'
  }
  return false
}

export { TikTokApiError }
