import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { CreateDeliverableInput } from '@/types'

/**
 * GET /api/campaigns/[id]/deliverables
 * List deliverables for a campaign
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
    .from('deliverables')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('due_date', { ascending: true, nullsFirst: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * POST /api/campaigns/[id]/deliverables
 * Add a deliverable to a campaign
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

  const body: Omit<CreateDeliverableInput, 'campaign_id'> = await request.json()

  // Validate required fields
  if (!body.title || !body.deliverable_type || !body.platform) {
    return NextResponse.json({ error: 'Missing required fields (title, deliverable_type, platform)' }, { status: 400 })
  }

  // Insert the deliverable
  const { data, error } = await supabase
    .from('deliverables')
    .insert({
      user_id: user.id,
      campaign_id: campaignId,
      title: body.title,
      deliverable_type: body.deliverable_type,
      platform: body.platform,
      account_handle: body.account_handle || null,
      quantity: body.quantity || 1,
      description: body.description || null,
      specifications: body.specifications || {},
      due_date: body.due_date || null,
      status: 'pending',
      notes: body.notes || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Optionally auto-generate a deadline for this deliverable
  if (body.due_date) {
    await supabase.from('deadlines').insert({
      user_id: user.id,
      campaign_id: campaignId,
      deliverable_id: data.id,
      title: `Leverans: ${body.title}`,
      due_date: body.due_date,
      deadline_type: 'delivery',
      priority: 'important',
      is_auto_generated: true,
    })
  }

  return NextResponse.json({ data })
}
