import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import type { UpdateCalendarFeedInput } from '@/types'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, UpdateCalendarFeedInputSchema } from '@/lib/validation'

/**
 * Generate a cryptographically secure feed token.
 * Uses crypto.randomBytes for stronger entropy than UUID v4.
 */
function generateSecureFeedToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * GET /api/calendar/feed
 * Get current user's calendar feed settings
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { data: feed, error } = await supabase
    .from('calendar_feeds')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned, which is fine
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Generate the feed URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.erp-base.se'

  if (feed) {
    return NextResponse.json({
      data: {
        ...feed,
        // Generate webcal:// URL for Apple Calendar
        webcalUrl: `webcal://${baseUrl.replace(/^https?:\/\//, '')}/api/calendar/feed/${feed.feed_token}`,
        // Generate https:// URL for other calendars
        httpsUrl: `${baseUrl}/api/calendar/feed/${feed.feed_token}`,
      },
    })
  }

  return NextResponse.json({ data: null })
}

/**
 * POST /api/calendar/feed
 * Create a new calendar feed for the current user
 */
export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rlSuccess, remaining: rlRemaining, reset: rlReset } = apiLimiter.check(user.id)
  if (!rlSuccess) return rateLimitResponse(rlReset)

  // Check if feed already exists
  const { data: existingFeed } = await supabase
    .from('calendar_feeds')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (existingFeed) {
    return NextResponse.json(
      { error: 'Calendar feed already exists' },
      { status: 409 }
    )
  }

  // Generate a cryptographically strong token and set expiry (1 year from now)
  const feedToken = generateSecureFeedToken()
  const expiresAt = new Date()
  expiresAt.setFullYear(expiresAt.getFullYear() + 1)

  // Create new feed
  const { data: feed, error } = await supabase
    .from('calendar_feeds')
    .insert({
      user_id: user.id,
      feed_token: feedToken,
      is_active: true,
      include_tax_deadlines: true,
      include_invoices: true,
      expires_at: expiresAt.toISOString(),
      token_version: 1,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.erp-base.se'

  return NextResponse.json({
    data: {
      ...feed,
      webcalUrl: `webcal://${baseUrl.replace(/^https?:\/\//, '')}/api/calendar/feed/${feed.feed_token}`,
      httpsUrl: `${baseUrl}/api/calendar/feed/${feed.feed_token}`,
    },
  })
}

/**
 * PUT /api/calendar/feed
 * Update calendar feed settings
 */
export async function PUT(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: putRlSuccess, remaining: putRlRemaining, reset: putRlReset } = apiLimiter.check(user.id)
  if (!putRlSuccess) return rateLimitResponse(putRlReset)

  const raw = await request.json()
  const validation = validateBody(UpdateCalendarFeedInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const { data: feed, error } = await supabase
    .from('calendar_feeds')
    .update(body as Record<string, unknown>)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.erp-base.se'

  return NextResponse.json({
    data: {
      ...feed,
      webcalUrl: `webcal://${baseUrl.replace(/^https?:\/\//, '')}/api/calendar/feed/${feed.feed_token}`,
      httpsUrl: `${baseUrl}/api/calendar/feed/${feed.feed_token}`,
    },
  })
}

/**
 * DELETE /api/calendar/feed
 * Regenerate calendar feed token (invalidates old URL)
 */
export async function DELETE() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: delRlSuccess, remaining: delRlRemaining, reset: delRlReset } = apiLimiter.check(user.id)
  if (!delRlSuccess) return rateLimitResponse(delRlReset)

  // Fetch current feed to get the current token_version
  const { data: currentFeed } = await supabase
    .from('calendar_feeds')
    .select('token_version')
    .eq('user_id', user.id)
    .single()

  // Generate a new cryptographically strong token and reset expiry (1 year from now)
  const newToken = generateSecureFeedToken()
  const newExpiresAt = new Date()
  newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1)

  const { data: feed, error } = await supabase
    .from('calendar_feeds')
    .update({
      feed_token: newToken,
      access_count: 0,
      last_accessed_at: null,
      expires_at: newExpiresAt.toISOString(),
      token_version: (currentFeed?.token_version || 0) + 1,
    })
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.erp-base.se'

  return NextResponse.json({
    data: {
      ...feed,
      webcalUrl: `webcal://${baseUrl.replace(/^https?:\/\//, '')}/api/calendar/feed/${feed.feed_token}`,
      httpsUrl: `${baseUrl}/api/calendar/feed/${feed.feed_token}`,
    },
  })
}
