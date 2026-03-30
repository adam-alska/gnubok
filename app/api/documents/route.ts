import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { uploadDocument } from '@/lib/core/documents/document-service'
import { requireCompanyId } from '@/lib/company/context'

ensureInitialized()

/**
 * POST /api/documents
 * Upload a document to the WORM archive
 *
 * Accepts multipart/form-data with:
 * - file: The document file
 * - upload_source (optional): 'camera' | 'file_upload' | 'email' | ...
 * - journal_entry_id (optional): Link to a journal entry
 * - journal_entry_line_id (optional): Link to a journal entry line
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const uploadSource = (formData.get('upload_source') as string) || 'file_upload'
    const journalEntryId = formData.get('journal_entry_id') as string | null
    const journalEntryLineId = formData.get('journal_entry_line_id') as string | null

    const buffer = await file.arrayBuffer()

    const document = await uploadDocument(supabase, user.id, companyId, {
      name: file.name,
      buffer,
      type: file.type,
    }, {
      upload_source: uploadSource as import('@/types').DocumentUploadSource,
      journal_entry_id: journalEntryId || undefined,
      journal_entry_line_id: journalEntryLineId || undefined,
    })

    return NextResponse.json({ data: document })
  } catch (error) {
    console.error('[documents/POST] Upload failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/documents
 * List documents with optional filtering
 *
 * Query params:
 * - journal_entry_id: Filter by journal entry
 * - current_only: If 'true', only return current versions (default: true)
 * - limit: Number of results (default: 50)
 * - offset: Pagination offset (default: 0)
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  const { searchParams } = new URL(request.url)
  const journalEntryId = searchParams.get('journal_entry_id')
  const currentOnly = searchParams.get('current_only') !== 'false'
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  let query = supabase
    .from('document_attachments')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (journalEntryId) {
    query = query.eq('journal_entry_id', journalEntryId)
  }

  if (currentOnly) {
    query = query.eq('is_current_version', true)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data, count })
}
