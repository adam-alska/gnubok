import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSettings, saveSettings } from '@/extensions/general/invoice-inbox'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const settings = await getSettings(user.id)
  return NextResponse.json({ data: settings })
}

export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const settings = await saveSettings(user.id, body)
  return NextResponse.json({ data: settings })
}
