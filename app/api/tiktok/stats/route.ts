import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getStatsSummary, calculateFollowerGrowth, getFollowerHistory } from '@/lib/tiktok/metrics'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')
  const period = searchParams.get('period') as '7d' | '30d' | '90d' | '1y' | null

  try {
    // If no account_id, get summary for user's active account
    if (!accountId) {
      const summary = await getStatsSummary(user.id)

      if (!summary) {
        return NextResponse.json({ error: 'No connected TikTok account found' }, { status: 404 })
      }

      return NextResponse.json({ summary })
    }

    // Verify account belongs to user
    const { data: account, error: fetchError } = await supabase
      .from('tiktok_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Get growth data for specified period
    if (period) {
      const growth = await calculateFollowerGrowth(accountId, period)
      return NextResponse.json({ growth })
    }

    // Get follower history (default 30 days)
    const days = parseInt(searchParams.get('days') || '30', 10)
    const history = await getFollowerHistory(accountId, days)

    return NextResponse.json({ history })
  } catch (error) {
    console.error('Error fetching TikTok stats:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
