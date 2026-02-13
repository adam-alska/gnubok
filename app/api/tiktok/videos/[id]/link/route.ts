import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: videoId } = await context.params
  const { campaign_id, deliverable_id } = await request.json()

  if (!campaign_id && !deliverable_id) {
    return NextResponse.json(
      { error: 'campaign_id or deliverable_id is required' },
      { status: 400 }
    )
  }

  try {
    // Verify video belongs to user
    const { data: video, error: fetchError } = await supabase
      .from('tiktok_videos')
      .select('id, user_id')
      .eq('id', videoId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // Verify campaign belongs to user (if provided)
    if (campaign_id) {
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('id')
        .eq('id', campaign_id)
        .eq('user_id', user.id)
        .single()

      if (campaignError || !campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
      }
    }

    // Verify deliverable belongs to user (if provided)
    if (deliverable_id) {
      const { data: deliverable, error: deliverableError } = await supabase
        .from('deliverables')
        .select('id, campaign_id')
        .eq('id', deliverable_id)
        .eq('user_id', user.id)
        .single()

      if (deliverableError || !deliverable) {
        return NextResponse.json({ error: 'Deliverable not found' }, { status: 404 })
      }

      // If deliverable is provided but campaign_id is not, use deliverable's campaign
      if (!campaign_id && deliverable.campaign_id) {
        const updateData = {
          campaign_id: deliverable.campaign_id,
          deliverable_id,
        }

        const { error: updateError } = await supabase
          .from('tiktok_videos')
          .update(updateData)
          .eq('id', videoId)

        if (updateError) {
          throw updateError
        }

        return NextResponse.json({ success: true, ...updateData })
      }
    }

    // Update video with campaign and/or deliverable link
    const updateData: { campaign_id?: string; deliverable_id?: string } = {}
    if (campaign_id) updateData.campaign_id = campaign_id
    if (deliverable_id) updateData.deliverable_id = deliverable_id

    const { error: updateError } = await supabase
      .from('tiktok_videos')
      .update(updateData)
      .eq('id', videoId)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ success: true, ...updateData })
  } catch (error) {
    console.error('Error linking video:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to link video' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: videoId } = await context.params

  try {
    // Verify video belongs to user
    const { data: video, error: fetchError } = await supabase
      .from('tiktok_videos')
      .select('id, user_id')
      .eq('id', videoId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // Remove campaign and deliverable links
    const { error: updateError } = await supabase
      .from('tiktok_videos')
      .update({ campaign_id: null, deliverable_id: null })
      .eq('id', videoId)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error unlinking video:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to unlink video' },
      { status: 500 }
    )
  }
}
