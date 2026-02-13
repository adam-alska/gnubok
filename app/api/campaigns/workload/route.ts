import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { PlatformType, DeliverableType, Deliverable } from '@/types'

interface WorkloadDay {
  date: string
  deliverables: Deliverable[]
  totalDeliverables: number
  byPlatform: Partial<Record<PlatformType, number>>
  byType: Partial<Record<DeliverableType, number>>
  workloadLevel: 'light' | 'normal' | 'heavy' | 'overloaded'
}

/**
 * GET /api/campaigns/workload
 * Get workload analysis for deliverables
 * Query params:
 *   - from: ISO date string (default: today)
 *   - to: ISO date string (default: 30 days from now)
 *   - group_by: 'day' | 'week' (default: 'day')
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') || new Date().toISOString().split('T')[0]
  const defaultTo = new Date()
  defaultTo.setDate(defaultTo.getDate() + 30)
  const to = searchParams.get('to') || defaultTo.toISOString().split('T')[0]
  const groupBy = searchParams.get('group_by') || 'day'

  // Fetch deliverables with due dates in range
  const { data: deliverables, error } = await supabase
    .from('deliverables')
    .select(`
      *,
      campaign:campaigns(id, name, customer_id, customer:customers(id, name))
    `)
    .eq('user_id', user.id)
    .gte('due_date', from)
    .lte('due_date', to)
    .not('status', 'in', '("approved","published")')
    .order('due_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group deliverables by date
  const workloadByDate: Record<string, WorkloadDay> = {}

  for (const deliverable of deliverables || []) {
    if (!deliverable.due_date) continue

    let dateKey = deliverable.due_date

    // If grouping by week, use the Monday of that week
    if (groupBy === 'week') {
      const date = new Date(deliverable.due_date)
      const day = date.getDay()
      const diff = date.getDate() - day + (day === 0 ? -6 : 1)
      date.setDate(diff)
      dateKey = date.toISOString().split('T')[0]
    }

    if (!workloadByDate[dateKey]) {
      workloadByDate[dateKey] = {
        date: dateKey,
        deliverables: [],
        totalDeliverables: 0,
        byPlatform: {},
        byType: {},
        workloadLevel: 'light'
      }
    }

    const day = workloadByDate[dateKey]
    day.deliverables.push(deliverable)
    day.totalDeliverables += deliverable.quantity || 1

    // Count by platform
    const platform = deliverable.platform as PlatformType
    day.byPlatform[platform] = (day.byPlatform[platform] || 0) + (deliverable.quantity || 1)

    // Count by type
    const type = deliverable.deliverable_type as DeliverableType
    day.byType[type] = (day.byType[type] || 0) + (deliverable.quantity || 1)
  }

  // Calculate workload levels
  for (const day of Object.values(workloadByDate)) {
    if (groupBy === 'week') {
      // Weekly thresholds
      if (day.totalDeliverables <= 3) day.workloadLevel = 'light'
      else if (day.totalDeliverables <= 7) day.workloadLevel = 'normal'
      else if (day.totalDeliverables <= 12) day.workloadLevel = 'heavy'
      else day.workloadLevel = 'overloaded'
    } else {
      // Daily thresholds
      if (day.totalDeliverables <= 1) day.workloadLevel = 'light'
      else if (day.totalDeliverables <= 2) day.workloadLevel = 'normal'
      else if (day.totalDeliverables <= 4) day.workloadLevel = 'heavy'
      else day.workloadLevel = 'overloaded'
    }
  }

  // Convert to sorted array
  const workload = Object.values(workloadByDate).sort((a, b) =>
    a.date.localeCompare(b.date)
  )

  // Calculate summary stats
  const totalDeliverables = deliverables?.reduce((sum, d) => sum + (d.quantity || 1), 0) || 0
  const heavyDays = workload.filter(d => d.workloadLevel === 'heavy').length
  const overloadedDays = workload.filter(d => d.workloadLevel === 'overloaded').length

  // Find busiest day/week
  const busiestPeriod = workload.length > 0
    ? workload.reduce((max, day) => day.totalDeliverables > max.totalDeliverables ? day : max)
    : null

  return NextResponse.json({
    workload,
    summary: {
      period: { from, to, group_by: groupBy },
      total_deliverables: totalDeliverables,
      total_periods: workload.length,
      heavy_periods: heavyDays,
      overloaded_periods: overloadedDays,
      busiest_period: busiestPeriod ? {
        date: busiestPeriod.date,
        count: busiestPeriod.totalDeliverables
      } : null
    }
  })
}
