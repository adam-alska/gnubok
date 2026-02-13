import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/contracts/[id]
 * Get a single contract
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
    .from('contracts')
    .select('*, campaign:campaigns(id, name)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * PATCH /api/contracts/[id]
 * Update contract metadata
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

  const body: {
    signing_date?: string
    is_primary?: boolean
    notes?: string
  } = await request.json()

  // Verify contract exists and belongs to user
  const { data: existing, error: fetchError } = await supabase
    .from('contracts')
    .select('*, campaign_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // If setting as primary, unset other primary contracts
  if (body.is_primary === true) {
    await supabase
      .from('contracts')
      .update({ is_primary: false })
      .eq('campaign_id', existing.campaign_id)
      .eq('is_primary', true)
      .neq('id', id)
  }

  // Build update object
  const updateData: Record<string, unknown> = {}
  if (body.signing_date !== undefined) updateData.signing_date = body.signing_date
  if (body.is_primary !== undefined) updateData.is_primary = body.is_primary
  if (body.notes !== undefined) updateData.notes = body.notes

  // Update the contract
  const { data, error } = await supabase
    .from('contracts')
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
 * DELETE /api/contracts/[id]
 * Delete a contract and its file
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

  // Get contract to find file path
  const { data: contract, error: fetchError } = await supabase
    .from('contracts')
    .select('file_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // Delete file from storage
  if (contract.file_path) {
    await supabase.storage.from('contracts').remove([contract.file_path])
  }

  // Delete contract record
  const { error } = await supabase
    .from('contracts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
