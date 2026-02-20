import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'

ensureInitialized()

/**
 * GET /api/documents/:id
 * Fetch document metadata + signed download URL (60 min expiry)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Fetch document record
  const { data: doc, error: docError } = await supabase
    .from('document_attachments')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (docError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Create signed download URL (60 minutes)
  const { data: signedUrl, error: signError } = await supabase.storage
    .from('documents')
    .createSignedUrl(doc.storage_path, 3600)

  if (signError) {
    return NextResponse.json(
      { error: `Failed to create download URL: ${signError.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    data: {
      ...doc,
      download_url: signedUrl.signedUrl,
    },
  })
}
