import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/contracts/[id]/download
 * Download a contract file
 * Returns a signed URL for direct download
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

  // Get contract to verify ownership and get file path
  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('file_path, filename, mime_type')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // Create signed URL (valid for 1 hour)
  const { data: signedUrl, error: signError } = await supabase.storage
    .from('contracts')
    .createSignedUrl(contract.file_path, 3600, {
      download: contract.filename
    })

  if (signError || !signedUrl) {
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
  }

  return NextResponse.json({
    url: signedUrl.signedUrl,
    filename: contract.filename,
    mime_type: contract.mime_type
  })
}
