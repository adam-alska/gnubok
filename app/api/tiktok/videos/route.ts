import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')
  const campaignId = searchParams.get('campaign_id')
  const limit = parseInt(searchParams.get('limit') || '20', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const unlinkedOnly = searchParams.get('unlinked_only') === 'true'

  try {
    let query = supabase
      .from('tiktok_videos')
      .select(`
        *,
        campaign:campaigns(id, name),
        deliverable:deliverables(id, title)
      `, { count: 'exact' })
      .eq('user_id', user.id)
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (accountId) {
      query = query.eq('tiktok_account_id', accountId)
    }

    if (campaignId) {
      query = query.eq('campaign_id', campaignId)
    }

    if (unlinkedOnly) {
      query = query.is('campaign_id', null)
    }

    const { data: videos, error, count } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({
      videos: videos || [],
      total: count || 0,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Error fetching TikTok videos:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch videos' },
      { status: 500 }
    )
  }
}
