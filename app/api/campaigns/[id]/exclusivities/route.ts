import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { CreateExclusivityInput } from '@/types'

/**
 * GET /api/campaigns/[id]/exclusivities
 * List exclusivities for a campaign
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
    .from('exclusivities')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('start_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * POST /api/campaigns/[id]/exclusivities
 * Add an exclusivity to a campaign
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

  const body: Omit<CreateExclusivityInput, 'campaign_id'> = await request.json()

  // Validate required fields
  if (!body.categories || body.categories.length === 0 || !body.start_date || !body.end_date) {
    return NextResponse.json({ error: 'Missing required fields (categories, start_date, end_date)' }, { status: 400 })
  }

  // Validate date range
  if (new Date(body.end_date) < new Date(body.start_date)) {
    return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
  }

  // Check for conflicts with existing exclusivities
  const { data: existingExclusivities } = await supabase
    .from('exclusivities')
    .select(`
      *,
      campaign:campaigns(id, name, customer_id)
    `)
    .eq('user_id', user.id)
    .neq('campaign_id', campaignId)
    .lte('start_date', body.end_date)
    .gte('end_date', body.start_date)

  const conflicts = []
  if (existingExclusivities) {
    for (const existing of existingExclusivities) {
      const overlappingCategories = body.categories.filter(cat =>
        existing.categories.some((existingCat: string) =>
          existingCat.toLowerCase() === cat.toLowerCase()
        )
      )

      if (overlappingCategories.length > 0) {
        conflicts.push({
          exclusivity_id: existing.id,
          campaign_id: existing.campaign?.id,
          campaign_name: existing.campaign?.name,
          overlapping_categories: overlappingCategories,
          overlap_start: body.start_date > existing.start_date ? body.start_date : existing.start_date,
          overlap_end: body.end_date < existing.end_date ? body.end_date : existing.end_date
        })
      }
    }
  }

  // Insert the exclusivity
  const { data, error } = await supabase
    .from('exclusivities')
    .insert({
      user_id: user.id,
      campaign_id: campaignId,
      categories: body.categories,
      excluded_brands: body.excluded_brands || [],
      start_date: body.start_date,
      end_date: body.end_date,
      start_calculation_type: body.start_calculation_type || 'absolute',
      end_calculation_type: body.end_calculation_type || 'absolute',
      start_reference: body.start_reference || null,
      end_reference: body.end_reference || null,
      start_offset_days: body.start_offset_days || null,
      end_offset_days: body.end_offset_days || null,
      notes: body.notes || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return with conflict warnings if any
  return NextResponse.json({
    data,
    conflicts: conflicts.length > 0 ? conflicts : undefined,
    warning: conflicts.length > 0
      ? `Varning: ${conflicts.length} överlappande exklusivitet(er) hittades`
      : undefined
  })
}
