import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/briefings/[id]/download
 * Get a signed URL to download a PDF briefing
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get the briefing
  const { data: briefing, error: fetchError } = await supabase
    .from('briefings')
    .select('briefing_type, content, filename')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Briefing not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // Verify it's a PDF type
  if (briefing.briefing_type !== 'pdf') {
    return NextResponse.json(
      { error: 'Download is only available for PDF briefings' },
      { status: 400 }
    )
  }

  if (!briefing.content) {
    return NextResponse.json(
      { error: 'No file path found for this briefing' },
      { status: 404 }
    )
  }

  // Create signed URL (valid for 1 hour)
  const { data: signedUrl, error: signError } = await supabase.storage
    .from('contracts')
    .createSignedUrl(briefing.content, 3600, {
      download: briefing.filename || 'briefing.pdf',
    })

  if (signError) {
    return NextResponse.json({ error: signError.message }, { status: 500 })
  }

  return NextResponse.json({ url: signedUrl.signedUrl })
}
