// TikTok API types (internal use)

// TikTok OAuth tokens
export interface TikTokTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  refresh_expires_in: number
  open_id: string
  scope: string
  token_type: string
}

// TikTok API response wrapper
export interface TikTokApiResponse<T> {
  data: T
  error: {
    code: string
    message: string
    log_id: string
  }
}

// TikTok user info response
export interface TikTokUserInfoResponse {
  user: {
    open_id: string
    union_id: string
    avatar_url: string
    avatar_url_100: string
    avatar_large_url: string
    display_name: string
    bio_description: string
    profile_deep_link: string
    is_verified: boolean
    follower_count: number
    following_count: number
    likes_count: number
    video_count: number
    username: string
  }
}

// TikTok video list response
export interface TikTokVideoListResponse {
  videos: TikTokVideoData[]
  cursor: number
  has_more: boolean
}

// TikTok video data from API
export interface TikTokVideoData {
  id: string
  title: string
  video_description: string
  duration: number
  cover_image_url: string
  share_url: string
  embed_link: string
  embed_html: string
  create_time: number
  like_count: number
  comment_count: number
  share_count: number
  view_count: number
}

// TikTok scopes
export const TIKTOK_SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'user.info.stats',
  'video.list',
] as const

export type TikTokScope = (typeof TIKTOK_SCOPES)[number]

// TikTok API endpoints
export const TIKTOK_API_ENDPOINTS = {
  authorize: 'https://www.tiktok.com/v2/auth/authorize/',
  token: 'https://open.tiktokapis.com/v2/oauth/token/',
  revokeToken: 'https://open.tiktokapis.com/v2/oauth/revoke/',
  userInfo: 'https://open.tiktokapis.com/v2/user/info/',
  videoList: 'https://open.tiktokapis.com/v2/video/list/',
} as const

// Rate limit info
export const TIKTOK_RATE_LIMITS = {
  requestsPerMinute: 600,
  requestsPerDay: 10000,
} as const

// Error codes
export const TIKTOK_ERROR_CODES = {
  INVALID_ACCESS_TOKEN: 'invalid_access_token',
  ACCESS_TOKEN_EXPIRED: 'access_token_expired',
  REFRESH_TOKEN_EXPIRED: 'refresh_token_expired',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  SCOPE_NOT_AUTHORIZED: 'scope_not_authorized',
  USER_NOT_FOUND: 'user_not_found',
} as const
