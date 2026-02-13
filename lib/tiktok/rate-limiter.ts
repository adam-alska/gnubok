import { TIKTOK_RATE_LIMITS } from './types'

// Simple in-memory rate limiter for TikTok API
// In production, consider using Redis for distributed rate limiting

interface RateLimitEntry {
  count: number
  windowStart: number
}

const rateLimits = new Map<string, RateLimitEntry>()

const WINDOW_SIZE_MS = 60 * 1000 // 1 minute window

/**
 * Check if a request can be made within rate limits
 * @param userId The user making the request
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimits.get(userId)

  // No existing entry, create new one
  if (!entry) {
    rateLimits.set(userId, { count: 1, windowStart: now })
    return true
  }

  // Check if window has expired
  if (now - entry.windowStart >= WINDOW_SIZE_MS) {
    // Reset window
    rateLimits.set(userId, { count: 1, windowStart: now })
    return true
  }

  // Check if under limit
  if (entry.count < TIKTOK_RATE_LIMITS.requestsPerMinute) {
    entry.count++
    return true
  }

  // Rate limited
  return false
}

/**
 * Get remaining requests in current window
 */
export function getRemainingRequests(userId: string): number {
  const entry = rateLimits.get(userId)

  if (!entry) {
    return TIKTOK_RATE_LIMITS.requestsPerMinute
  }

  const now = Date.now()
  if (now - entry.windowStart >= WINDOW_SIZE_MS) {
    return TIKTOK_RATE_LIMITS.requestsPerMinute
  }

  return Math.max(0, TIKTOK_RATE_LIMITS.requestsPerMinute - entry.count)
}

/**
 * Get time until rate limit resets (in ms)
 */
export function getResetTime(userId: string): number {
  const entry = rateLimits.get(userId)

  if (!entry) {
    return 0
  }

  const now = Date.now()
  const elapsed = now - entry.windowStart

  if (elapsed >= WINDOW_SIZE_MS) {
    return 0
  }

  return WINDOW_SIZE_MS - elapsed
}

/**
 * Wait for rate limit to reset
 */
export async function waitForRateLimit(userId: string): Promise<void> {
  const resetTime = getResetTime(userId)

  if (resetTime > 0) {
    await new Promise(resolve => setTimeout(resolve, resetTime))
  }
}

/**
 * Clean up old rate limit entries (call periodically)
 */
export function cleanupRateLimits(): void {
  const now = Date.now()

  for (const [userId, entry] of rateLimits.entries()) {
    if (now - entry.windowStart >= WINDOW_SIZE_MS * 2) {
      rateLimits.delete(userId)
    }
  }
}
