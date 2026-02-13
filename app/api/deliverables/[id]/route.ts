import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { CreateDeliverableInput } from '@/types'

/**
 * GET /api/deliverables/[id]
 * Get a single deliverable
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
    .from('deliverables')
    .select('*, campaign:campaigns(id, name, customer_id)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Deliverable not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * PATCH /api/deliverables/[id]
 * Update a deliverable
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

  const body: Partial<Omit<CreateDeliverableInput, 'campaign_id'>> = await request.json()

  // Verify deliverable exists and belongs to user
  const { data: existing, error: fetchError } = await supabase
    .from('deliverables')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Deliverable not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // Build update object
  const updateData: Record<string, unknown> = {}

  if (body.title !== undefined) updateData.title = body.title
  if (body.deliverable_type !== undefined) updateData.deliverable_type = body.deliverable_type
  if (body.platform !== undefined) updateData.platform = body.platform
  if (body.account_handle !== undefined) updateData.account_handle = body.account_handle
  if (body.quantity !== undefined) updateData.quantity = body.quantity
  if (body.description !== undefined) updateData.description = body.description
  if (body.specifications !== undefined) updateData.specifications = body.specifications
  if (body.due_date !== undefined) updateData.due_date = body.due_date
  if (body.notes !== undefined) updateData.notes = body.notes

  // Update the deliverable
  const { data, error } = await supabase
    .from('deliverables')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update auto-generated deadline if due_date changed
  if (body.due_date !== undefined) {
    await supabase
      .from('deadlines')
      .update({ due_date: body.due_date })
      .eq('deliverable_id', id)
      .eq('is_auto_generated', true)
  }

  return NextResponse.json({ data })
}

/**
 * DELETE /api/deliverables/[id]
 * Delete a deliverable
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

  // Delete auto-generated deadlines first
  await supabase
    .from('deadlines')
    .delete()
    .eq('deliverable_id', id)
    .eq('is_auto_generated', true)

  // Delete the deliverable
  const { error } = await supabase
    .from('deliverables')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
