import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { CreateExclusivityInput } from '@/types'

/**
 * GET /api/exclusivities/[id]
 * Get a single exclusivity
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
    .from('exclusivities')
    .select('*, campaign:campaigns(id, name, customer_id)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Exclusivity not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * PATCH /api/exclusivities/[id]
 * Update an exclusivity
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

  const body: Partial<Omit<CreateExclusivityInput, 'campaign_id'>> = await request.json()

  // Verify exclusivity exists and belongs to user
  const { data: existing, error: fetchError } = await supabase
    .from('exclusivities')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Exclusivity not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // Build update object
  const updateData: Record<string, unknown> = {}

  if (body.categories !== undefined) updateData.categories = body.categories
  if (body.excluded_brands !== undefined) updateData.excluded_brands = body.excluded_brands
  if (body.start_date !== undefined) updateData.start_date = body.start_date
  if (body.end_date !== undefined) updateData.end_date = body.end_date
  if (body.start_calculation_type !== undefined) updateData.start_calculation_type = body.start_calculation_type
  if (body.end_calculation_type !== undefined) updateData.end_calculation_type = body.end_calculation_type
  if (body.start_reference !== undefined) updateData.start_reference = body.start_reference
  if (body.end_reference !== undefined) updateData.end_reference = body.end_reference
  if (body.start_offset_days !== undefined) updateData.start_offset_days = body.start_offset_days
  if (body.end_offset_days !== undefined) updateData.end_offset_days = body.end_offset_days
  if (body.notes !== undefined) updateData.notes = body.notes

  // Validate date range if dates are being updated
  const startDate = body.start_date ?? existing.start_date
  const endDate = body.end_date ?? existing.end_date
  if (new Date(endDate) < new Date(startDate)) {
    return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
  }

  // Update the exclusivity
  const { data, error } = await supabase
    .from('exclusivities')
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
 * DELETE /api/exclusivities/[id]
 * Delete an exclusivity
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

  const { error } = await supabase
    .from('exclusivities')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
