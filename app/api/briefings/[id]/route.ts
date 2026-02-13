import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { CreateBriefingInput } from '@/types'

/**
 * GET /api/briefings/[id]
 * Get a single briefing
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

  const { data, error } = await supabase
    .from('briefings')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Briefing not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * PATCH /api/briefings/[id]
 * Update a briefing
 */
export async function PATCH(
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

  // Verify briefing exists and belongs to user
  const { data: existing, error: fetchError } = await supabase
    .from('briefings')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Briefing not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const body: Partial<CreateBriefingInput> = await request.json()

  // Build update object
  const updateData: Record<string, unknown> = {}

  if (body.title !== undefined) updateData.title = body.title
  if (body.content !== undefined) updateData.content = body.content
  if (body.text_content !== undefined) updateData.text_content = body.text_content
  if (body.notes !== undefined) updateData.notes = body.notes

  // Only allow updating certain fields for PDF type
  if (existing.briefing_type === 'pdf') {
    if (body.filename !== undefined) updateData.filename = body.filename
    if (body.file_size !== undefined) updateData.file_size = body.file_size
    if (body.mime_type !== undefined) updateData.mime_type = body.mime_type
  }

  // Update the briefing
  const { data, error } = await supabase
    .from('briefings')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * DELETE /api/briefings/[id]
 * Delete a briefing
 */
export async function DELETE(
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

  // Get the briefing to check if we need to delete a file
  const { data: briefing, error: fetchError } = await supabase
    .from('briefings')
    .select('briefing_type, content')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Briefing not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // If it's a PDF, delete the file from storage
  if (briefing.briefing_type === 'pdf' && briefing.content) {
    await supabase.storage.from('contracts').remove([briefing.content])
  }

  // Delete the briefing
  const { error } = await supabase
    .from('briefings')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
