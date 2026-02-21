import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSettings, saveSettings } from '@/extensions/general/push-notifications'

/**
 * GET /api/extensions/push-notifications/settings
 * Get the current user's push-notification extension settings
 */
export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const settings = await getSettings(user.id)
  return NextResponse.json({ data: settings })
}

/**
 * PATCH /api/extensions/push-notifications/settings
 * Update the current user's push-notification extension settings
 */
export async function PATCH(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  const allowedKeys = [
    'periodLockedEnabled',
    'periodYearClosedEnabled',
    'invoiceSentEnabled',
    'receiptExtractedEnabled',
    'receiptMatchedEnabled',
  ]
  const filtered: Record<string, unknown> = {}
  for (const key of allowedKeys) {
    if (key in body) {
      filtered[key] = body[key]
    }
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })
  }

  const settings = await saveSettings(user.id, filtered)
  return NextResponse.json({ data: settings })
}
