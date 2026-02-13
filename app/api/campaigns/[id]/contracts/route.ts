import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/campaigns/[id]/contracts
 * List contracts for a campaign
 */
export async function GET(
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

  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('uploaded_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * POST /api/campaigns/[id]/contracts
 * Upload a contract to a campaign
 * Expects multipart/form-data with:
 *   - file: the contract file
 *   - signing_date: optional ISO date string
 *   - is_primary: optional boolean
 *   - notes: optional string
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
    .select('id, name')
    .eq('id', campaignId)
    .eq('user_id', user.id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const signingDate = formData.get('signing_date') as string | null
    const isPrimary = formData.get('is_primary') === 'true'
    const notes = formData.get('notes') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type (PDF, DOC, DOCX, images)
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({
        error: 'Invalid file type. Allowed: PDF, DOC, DOCX, JPG, PNG, WEBP'
      }, { status: 400 })
    }

    // Max file size: 10MB
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large. Max size: 10MB' }, { status: 400 })
    }

    // Generate unique file path
    const timestamp = Date.now()
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = `${user.id}/${campaignId}/${timestamp}_${safeFilename}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('contracts')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // If this is set as primary, unset other primary contracts
    if (isPrimary) {
      await supabase
        .from('contracts')
        .update({ is_primary: false })
        .eq('campaign_id', campaignId)
        .eq('is_primary', true)
    }

    // Create contract record
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        user_id: user.id,
        campaign_id: campaignId,
        filename: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
        signing_date: signingDate || null,
        is_primary: isPrimary,
        notes: notes || null,
        extraction_status: 'pending'
      })
      .select()
      .single()

    if (error) {
      // Try to clean up uploaded file
      await supabase.storage.from('contracts').remove([filePath])
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If contract is signed and this is primary, update campaign status
    if (isPrimary && signingDate) {
      await supabase
        .from('campaigns')
        .update({
          contract_signed_at: signingDate,
          status: 'contracted'
        })
        .eq('id', campaignId)
        .eq('status', 'negotiation')
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Contract upload error:', err)
    return NextResponse.json({ error: 'Failed to process upload' }, { status: 500 })
  }
}
