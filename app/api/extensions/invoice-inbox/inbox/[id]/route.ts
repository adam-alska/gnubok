import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const { data, error } = await supabase
    .from('invoice_inbox_items')
    .select('*, document:document_attachments(id, file_name, mime_type, storage_path), supplier:suppliers(id, name)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  // Verify item exists and belongs to user
  const { data: existing, error: findError } = await supabase
    .from('invoice_inbox_items')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (findError || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (existing.status === 'confirmed') {
    return NextResponse.json({ error: 'Cannot edit confirmed item' }, { status: 400 })
  }

  // Only allow updating certain fields
  const allowedFields: Record<string, unknown> = {}
  if (body.extracted_data !== undefined) allowedFields.extracted_data = body.extracted_data
  if (body.matched_supplier_id !== undefined) allowedFields.matched_supplier_id = body.matched_supplier_id

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('invoice_inbox_items')
    .update(allowedFields)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Soft delete: set status to rejected
  const { data, error } = await supabase
    .from('invoice_inbox_items')
    .update({ status: 'rejected' })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data })
}
