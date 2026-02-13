import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { CreateBriefingInput, BriefingType } from '@/types'

/**
 * GET /api/campaigns/[id]/briefings
 * List all briefings for a campaign
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

  // Verify campaign belongs to user
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('user_id', user.id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Fetch briefings
  const { data, error } = await supabase
    .from('briefings')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * POST /api/campaigns/[id]/briefings
 * Create a new briefing for a campaign
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

  // Verify campaign belongs to user
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('user_id', user.id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const body: Omit<CreateBriefingInput, 'campaign_id'> = await request.json()

  // Validate required fields
  if (!body.title || !body.briefing_type) {
    return NextResponse.json(
      { error: 'Title and briefing_type are required' },
      { status: 400 }
    )
  }

  // Validate briefing type
  const validTypes: BriefingType[] = ['pdf', 'link', 'text']
  if (!validTypes.includes(body.briefing_type)) {
    return NextResponse.json(
      { error: 'Invalid briefing_type. Must be pdf, link, or text' },
      { status: 400 }
    )
  }

  // Validate type-specific content
  if (body.briefing_type === 'text' && !body.text_content) {
    return NextResponse.json(
      { error: 'text_content is required for text type briefings' },
      { status: 400 }
    )
  }

  if (body.briefing_type === 'link' && !body.content) {
    return NextResponse.json(
      { error: 'content (URL) is required for link type briefings' },
      { status: 400 }
    )
  }

  if (body.briefing_type === 'pdf' && !body.content) {
    return NextResponse.json(
      { error: 'content (file path) is required for pdf type briefings' },
      { status: 400 }
    )
  }

  // Create the briefing
  const { data, error } = await supabase
    .from('briefings')
    .insert({
      campaign_id: campaignId,
      user_id: user.id,
      briefing_type: body.briefing_type,
      title: body.title,
      content: body.content || null,
      text_content: body.text_content || null,
      filename: body.filename || null,
      file_size: body.file_size || null,
      mime_type: body.mime_type || null,
      notes: body.notes || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
