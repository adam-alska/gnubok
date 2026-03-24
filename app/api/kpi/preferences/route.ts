import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { mergeWithDefaults } from '@/lib/reports/kpi-definitions'
import type { KPIPreferences } from '@/types'

const EXTENSION_ID = 'core/kpi'
const KEY = 'preferences'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('extension_data')
    .select('value')
    .eq('user_id', user.id)
    .eq('extension_id', EXTENSION_ID)
    .eq('key', KEY)
    .single()

  const preferences = mergeWithDefaults((data?.value as Partial<KPIPreferences>) ?? {})
  return NextResponse.json({ data: preferences })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const prefs = body as Partial<KPIPreferences>

  // Validate account overrides — must be 4-digit numeric strings
  if (prefs.accountOverrides) {
    for (const [kpiId, accounts] of Object.entries(prefs.accountOverrides)) {
      if (!Array.isArray(accounts)) {
        return NextResponse.json(
          { error: `accountOverrides.${kpiId} must be an array` },
          { status: 400 }
        )
      }
      for (const acc of accounts) {
        if (typeof acc !== 'string' || !/^\d{4}$/.test(acc)) {
          return NextResponse.json(
            { error: `Invalid account number "${acc}" in ${kpiId} — must be 4 digits` },
            { status: 400 }
          )
        }
      }
    }
  }

  const merged = mergeWithDefaults(prefs)

  const { data, error } = await supabase
    .from('extension_data')
    .upsert(
      {
        user_id: user.id,
        extension_id: EXTENSION_ID,
        key: KEY,
        value: merged,
      },
      { onConflict: 'user_id,extension_id,key' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data.value })
}
