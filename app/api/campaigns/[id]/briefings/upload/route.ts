import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/campaigns/[id]/briefings/upload
 * Upload a PDF briefing file
 * Expects multipart/form-data with:
 *   - file: the PDF file
 *   - title: briefing title
 *   - notes: optional notes
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: campaignId } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify campaign exists and belongs to user
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('user_id', user.id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const title = formData.get('title') as string | null
    const notes = formData.get('notes') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Validate file type (only PDF)
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF files are allowed.' },
        { status: 400 }
      )
    }

    // Max file size: 10MB
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Max size: 10MB' },
        { status: 400 }
      )
    }

    // Generate unique file path in contracts bucket (reusing existing bucket)
    // Path: {user_id}/{campaign_id}/briefings/{timestamp}_{filename}
    const timestamp = Date.now()
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = `${user.id}/${campaignId}/briefings/${timestamp}_${safeFilename}`

    // Upload to Supabase Storage (using contracts bucket)
    const { error: uploadError } = await supabase.storage
      .from('contracts')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Create briefing record
    const { data, error } = await supabase
      .from('briefings')
      .insert({
        user_id: user.id,
        campaign_id: campaignId,
        briefing_type: 'pdf',
        title: title.trim(),
        content: filePath,
        filename: file.name,
        file_size: file.size,
        mime_type: file.type,
        notes: notes?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      // Try to clean up uploaded file
      await supabase.storage.from('contracts').remove([filePath])
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Briefing upload error:', err)
    return NextResponse.json({ error: 'Failed to process upload' }, { status: 500 })
  }
}
