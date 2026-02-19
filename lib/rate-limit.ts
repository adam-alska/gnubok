import { NextResponse } from 'next/server'

interface RateLimitConfig {
  interval: number  // time window in ms
  limit: number     // max requests per window
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

const limiters = new Map<string, Map<string, RateLimitEntry>>()

export function rateLimit(name: string, config: RateLimitConfig) {
  if (!limiters.has(name)) {
    limiters.set(name, new Map())
  }

  return {
    check(key: string): { success: boolean; remaining: number; reset: number } {
      const store = limiters.get(name)!
      const now = Date.now()
      const entry = store.get(key)

      if (!entry || now > entry.resetTime) {
        store.set(key, { count: 1, resetTime: now + config.interval })
        return { success: true, remaining: config.limit - 1, reset: now + config.interval }
      }

      if (entry.count >= config.limit) {
        return { success: false, remaining: 0, reset: entry.resetTime }
      }

      entry.count++
      return { success: true, remaining: config.limit - entry.count, reset: entry.resetTime }
    }
  }
}

// Pre-configured limiters
export const apiLimiter = rateLimit('api', { interval: 60_000, limit: 100 })
export const authLimiter = rateLimit('auth', { interval: 60_000, limit: 10 })
export const uploadLimiter = rateLimit('upload', { interval: 60_000, limit: 20 })
export const calendarLimiter = rateLimit('calendar', { interval: 3600_000, limit: 1000 })

// Helper to get rate limit response
export function rateLimitResponse(reset: number) {
  return NextResponse.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
        'X-RateLimit-Reset': String(reset)
      }
    }
  )
}

// Periodic cleanup to prevent memory leaks - clean expired entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes

function cleanupExpiredEntries() {
  const now = Date.now()
  for (const [, store] of limiters) {
    for (const [key, entry] of store) {
      if (now > entry.resetTime) {
        store.delete(key)
      }
    }
  }
}

// Only start cleanup in non-test environments
if (typeof globalThis !== 'undefined') {
  const globalKey = '__rateLimitCleanupInterval__' as keyof typeof globalThis
  if (!(globalThis as Record<string, unknown>)[globalKey]) {
    const interval = setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL)
    // Allow the process to exit even if the interval is still running
    if (interval.unref) {
      interval.unref()
    }
    (globalThis as Record<string, unknown>)[globalKey] = interval
  }
}
