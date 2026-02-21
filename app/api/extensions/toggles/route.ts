import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('extension_toggles')
    .select('*')
    .eq('user_id', user.id)
    .eq('enabled', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { sector_slug, extension_slug, enabled } = body

  if (!sector_slug || !extension_slug || typeof enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'sector_slug, extension_slug, and enabled are required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('extension_toggles')
    .upsert(
      {
        user_id: user.id,
        sector_slug,
        extension_slug,
        enabled,
      },
      { onConflict: 'user_id,sector_slug,extension_slug' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
