import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getVapidPublicKey } from '@/lib/push/web-push'

/**
 * GET /api/push/subscribe
 * Get the VAPID public key for client-side subscription
 */
export async function GET() {
  const vapidKey = getVapidPublicKey()

  if (!vapidKey) {
    return NextResponse.json(
      { error: 'Push notifications not configured' },
      { status: 500 }
    )
  }

  return NextResponse.json({ vapidPublicKey: vapidKey })
}

/**
 * POST /api/push/subscribe
 * Save a new push subscription
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { endpoint, keys } = body

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: 'Invalid subscription data' },
      { status: 400 }
    )
  }

  // Get user agent for debugging
  const userAgent = request.headers.get('user-agent') || null

  // Upsert subscription (update if endpoint exists)
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent,
        is_active: true,
        last_used_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,endpoint',
      }
    )
    .select()
    .single()

  if (error) {
    console.error('Error saving subscription:', error)
    return NextResponse.json(
      { error: 'Failed to save subscription' },
      { status: 500 }
    )
  }

  // Also ensure notification settings exist with defaults
  await supabase
    .from('notification_settings')
    .upsert(
      {
        user_id: user.id,
        tax_deadlines_enabled: true,
        invoice_reminders_enabled: true,
        push_enabled: true,
        email_enabled: true,
        quiet_start: '21:00',
        quiet_end: '08:00',
      },
      {
        onConflict: 'user_id',
        ignoreDuplicates: true,
      }
    )

  return NextResponse.json({ success: true, id: data.id })
}

/**
 * DELETE /api/push/subscribe
 * Remove a push subscription
 */
export async function DELETE(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { endpoint } = body

  if (!endpoint) {
    return NextResponse.json(
      { error: 'Endpoint is required' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)

  if (error) {
    return NextResponse.json(
      { error: 'Failed to remove subscription' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
