import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Legacy general extensions default to enabled when no toggle row exists
const LEGACY_GENERAL_EXTENSIONS = [
  'receipt-ocr',
  'ai-categorization',
  'ai-chat',
  'push-notifications',
  'enable-banking',
]

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sector: string; slug: string }> }
) {
  const { sector, slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data } = await supabase
    .from('extension_toggles')
    .select('*')
    .eq('user_id', user.id)
    .eq('sector_slug', sector)
    .eq('extension_slug', slug)
    .single()

  if (data) {
    return NextResponse.json({ data })
  }

  // No toggle row: legacy general extensions default to enabled
  const defaultEnabled =
    sector === 'general' && LEGACY_GENERAL_EXTENSIONS.includes(slug)
  return NextResponse.json({ data: { enabled: defaultEnabled } })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sector: string; slug: string }> }
) {
  const { sector, slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('extension_toggles')
    .delete()
    .eq('user_id', user.id)
    .eq('sector_slug', sector)
    .eq('extension_slug', slug)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
