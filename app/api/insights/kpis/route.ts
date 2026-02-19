import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { calculateKPIs } from '@/lib/insights/financial-analysis'
import type { KPIDashboardData } from '@/types/financial-insights'

/**
 * GET /api/insights/kpis
 * Get current KPIs with historical trend data.
 */
export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  try {
    const now = new Date()
    const current = await calculateKPIs(user.id, now, supabase)

    // Get previous month snapshot
    const lastMonth = new Date(now)
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    const lastMonthStr = lastMonth.toISOString().split('T')[0].substring(0, 7)

    const { data: prevMonthData } = await supabase
      .from('kpi_snapshots')
      .select('*')
      .eq('user_id', user.id)
      .eq('period_type', 'monthly')
      .like('snapshot_date', `${lastMonthStr}%`)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()

    // Get previous year snapshot
    const lastYear = new Date(now)
    lastYear.setFullYear(lastYear.getFullYear() - 1)
    const lastYearMonth = lastYear.toISOString().split('T')[0].substring(0, 7)

    const { data: prevYearData } = await supabase
      .from('kpi_snapshots')
      .select('*')
      .eq('user_id', user.id)
      .eq('period_type', 'monthly')
      .like('snapshot_date', `${lastYearMonth}%`)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single()

    // Get monthly trend (last 12 months)
    const twelveMonthsAgo = new Date(now)
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

    const { data: monthlyTrend } = await supabase
      .from('kpi_snapshots')
      .select('*')
      .eq('user_id', user.id)
      .eq('period_type', 'monthly')
      .gte('snapshot_date', twelveMonthsAgo.toISOString().split('T')[0])
      .order('snapshot_date', { ascending: true })

    // Get active insights
    const { data: insights } = await supabase
      .from('financial_insights')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_dismissed', false)
      .order('severity', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(10)

    const dashboardData: KPIDashboardData = {
      current,
      previousMonth: prevMonthData || null,
      previousYear: prevYearData || null,
      monthlyTrend: monthlyTrend || [],
      insights: insights || [],
    }

    return NextResponse.json({ data: dashboardData })
  } catch (error) {
    console.error('KPI calculation error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate KPIs' },
      { status: 500 }
    )
  }
}
