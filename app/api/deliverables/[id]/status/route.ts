import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { DeliverableStatus } from '@/types'

const VALID_STATUSES: DeliverableStatus[] = [
  'pending',
  'in_progress',
  'submitted',
  'revision',
  'approved',
  'published'
]

/**
 * PATCH /api/deliverables/[id]/status
 * Update deliverable status with automatic timestamp tracking
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

  const body: { status: DeliverableStatus } = await request.json()

  // Validate status
  if (!body.status || !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({
      error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
    }, { status: 400 })
  }

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

  // Build update object with automatic timestamps
  const now = new Date().toISOString()
  const updateData: Record<string, unknown> = {
    status: body.status
  }

  // Set appropriate timestamp based on status
  if (body.status === 'submitted' && !existing.submitted_at) {
    updateData.submitted_at = now
  } else if (body.status === 'approved' && !existing.approved_at) {
    updateData.approved_at = now
  } else if (body.status === 'published' && !existing.published_at) {
    updateData.published_at = now
  }

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

  // If status is now 'approved' or 'published', mark related deadline as completed
  if (body.status === 'approved' || body.status === 'published') {
    await supabase
      .from('deadlines')
      .update({
        is_completed: true,
        completed_at: now
      })
      .eq('deliverable_id', id)
      .eq('is_completed', false)
  }

  // Check if all deliverables are completed - if so, maybe update campaign status
  if (body.status === 'published' || body.status === 'approved') {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', existing.campaign_id)
      .single()

    if (campaign && campaign.status === 'active') {
      // Check if all deliverables are done
      const { data: allDeliverables } = await supabase
        .from('deliverables')
        .select('status')
        .eq('campaign_id', existing.campaign_id)

      const allDone = allDeliverables?.every(d =>
        d.status === 'approved' || d.status === 'published'
      )

      if (allDone) {
        await supabase
          .from('campaigns')
          .update({ status: 'delivered' })
          .eq('id', existing.campaign_id)
      }
    }
  }

  return NextResponse.json({ data })
}
