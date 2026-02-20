import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { linkToJournalEntry } from '@/lib/core/documents/document-service'

ensureInitialized()

/**
 * POST /api/documents/:id/link
 * Link a document to a journal entry (verifikation)
 *
 * Request body:
 * - journal_entry_id: string (required)
 * - journal_entry_line_id: string (optional)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const body = await request.json()

    if (!body.journal_entry_id) {
      return NextResponse.json(
        { error: 'journal_entry_id is required' },
        { status: 400 }
      )
    }

    const document = await linkToJournalEntry(
      user.id,
      id,
      body.journal_entry_id,
      body.journal_entry_line_id
    )

    return NextResponse.json({ data: document })
  } catch (error) {
    console.error('[documents/link/POST] Link failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Link failed' },
      { status: 500 }
    )
  }
}
