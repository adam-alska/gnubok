import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/receipts/queue
 * Get unmatched receipts and queue statistics
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse query params
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') // 'pending', 'extracted', 'confirmed', or null for all
  const unmatched = searchParams.get('unmatched') === 'true'

  // Build query
  let query = supabase
    .from('receipts')
    .select(`
      *,
      line_items:receipt_line_items(*)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  if (unmatched) {
    query = query.is('matched_transaction_id', null)
  }

  const { data: receipts, error: receiptsError } = await query

  if (receiptsError) {
    console.error('Receipts fetch error:', receiptsError)
    return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 })
  }

  // Get counts for queue summary
  const { count: unmatchedReceiptsCount } = await supabase
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .is('matched_transaction_id', null)

  const { count: pendingReviewCount } = await supabase
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'extracted')

  const { count: unmatchedTransactionsCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .lt('amount', 0)
    .is('receipt_id', null)

  // Calculate streak (days with at least one categorized transaction)
  const { data: recentActivity } = await supabase
    .from('receipts')
    .select('created_at')
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(30)

  let streakCount = 0
  if (recentActivity && recentActivity.length > 0) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const activityDates = new Set(
      recentActivity.map((r) => new Date(r.created_at).toISOString().split('T')[0])
    )

    let checkDate = new Date(today)
    while (activityDates.has(checkDate.toISOString().split('T')[0])) {
      streakCount++
      checkDate.setDate(checkDate.getDate() - 1)
    }
  }

  return NextResponse.json({
    data: {
      receipts,
      summary: {
        unmatched_receipts_count: unmatchedReceiptsCount || 0,
        unmatched_transactions_count: unmatchedTransactionsCount || 0,
        pending_review_count: pendingReviewCount || 0,
        streak_count: streakCount,
      },
    },
  })
}
