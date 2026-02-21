import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSettings, saveSettings } from '@/extensions/general/ai-categorization'

/**
 * GET /api/extensions/ai-categorization/settings
 * Get the current user's ai-categorization extension settings
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
 * PATCH /api/extensions/ai-categorization/settings
 * Update the current user's ai-categorization extension settings
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

  // Validate setting keys
  const allowedKeys = [
    'autoSuggestEnabled',
    'confidenceThreshold',
    'providerModel',
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
