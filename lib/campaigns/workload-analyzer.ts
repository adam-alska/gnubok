/**
 * Workload Analyzer for Campaigns
 *
 * Analyzes deliverable workload over time.
 */

import type {
  Deliverable,
  Campaign,
  PlatformType,
  DeliverableType,
  WorkloadAnalysis
} from '@/types'

/**
 * Workload thresholds for different periods
 */
export const DAILY_THRESHOLDS = {
  light: 1,
  normal: 2,
  heavy: 4,
  // Anything above heavy is overloaded
}

export const WEEKLY_THRESHOLDS = {
  light: 3,
  normal: 7,
  heavy: 12,
}

/**
 * Get workload level based on deliverable count
 */
export function getWorkloadLevel(
  count: number,
  period: 'day' | 'week' = 'day'
): 'light' | 'normal' | 'heavy' | 'overloaded' {
  const thresholds = period === 'week' ? WEEKLY_THRESHOLDS : DAILY_THRESHOLDS

  if (count <= thresholds.light) return 'light'
  if (count <= thresholds.normal) return 'normal'
  if (count <= thresholds.heavy) return 'heavy'
  return 'overloaded'
}

/**
 * Analyze workload for a specific date
 */
export function analyzeWorkloadForDate(
  deliverables: Deliverable[],
  date: string
): WorkloadAnalysis {
  // Filter deliverables due on this date that aren't completed
  const dueToday = deliverables.filter(d =>
    d.due_date === date &&
    !['approved', 'published'].includes(d.status)
  )

  const totalCount = dueToday.reduce((sum, d) => sum + (d.quantity || 1), 0)

  // Group by platform
  const byPlatform: Partial<Record<PlatformType, number>> = {}
  for (const d of dueToday) {
    byPlatform[d.platform] = (byPlatform[d.platform] || 0) + (d.quantity || 1)
  }

  // Group by type
  const byType: Partial<Record<DeliverableType, number>> = {}
  for (const d of dueToday) {
    byType[d.deliverable_type] = (byType[d.deliverable_type] || 0) + (d.quantity || 1)
  }

  return {
    date,
    deliverables: dueToday,
    totalDeliverables: totalCount,
    byPlatform: byPlatform as Record<PlatformType, number>,
    byType: byType as Record<DeliverableType, number>,
    workloadLevel: getWorkloadLevel(totalCount, 'day'),
  }
}

/**
 * Analyze workload for a date range
 */
export function analyzeWorkloadRange(
  deliverables: Deliverable[],
  startDate: string,
  endDate: string
): WorkloadAnalysis[] {
  const results: WorkloadAnalysis[] = []
  const dates = getDateRange(startDate, endDate)

  for (const date of dates) {
    const analysis = analyzeWorkloadForDate(deliverables, date)
    if (analysis.totalDeliverables > 0) {
      results.push(analysis)
    }
  }

  return results
}

/**
 * Get weekly workload summary
 */
export function analyzeWeeklyWorkload(
  deliverables: Deliverable[],
  startDate: string,
  weeks: number = 4
): {
  weekStart: string
  weekEnd: string
  deliverables: Deliverable[]
  totalCount: number
  workloadLevel: 'light' | 'normal' | 'heavy' | 'overloaded'
}[] {
  const results = []
  let currentStart = getMonday(startDate)

  for (let i = 0; i < weeks; i++) {
    const weekEnd = addDays(currentStart, 6)

    const weekDeliverables = deliverables.filter(d =>
      d.due_date &&
      d.due_date >= currentStart &&
      d.due_date <= weekEnd &&
      !['approved', 'published'].includes(d.status)
    )

    const totalCount = weekDeliverables.reduce((sum, d) => sum + (d.quantity || 1), 0)

    results.push({
      weekStart: currentStart,
      weekEnd,
      deliverables: weekDeliverables,
      totalCount,
      workloadLevel: getWorkloadLevel(totalCount, 'week'),
    })

    currentStart = addDays(currentStart, 7)
  }

  return results
}

/**
 * Find overloaded dates in a range
 */
export function findOverloadedDates(
  deliverables: Deliverable[],
  startDate: string,
  endDate: string
): string[] {
  const dates = getDateRange(startDate, endDate)
  const overloaded: string[] = []

  for (const date of dates) {
    const analysis = analyzeWorkloadForDate(deliverables, date)
    if (analysis.workloadLevel === 'overloaded') {
      overloaded.push(date)
    }
  }

  return overloaded
}

/**
 * Get the busiest day in a range
 */
export function findBusiestDay(
  deliverables: Deliverable[],
  startDate: string,
  endDate: string
): WorkloadAnalysis | null {
  const analyses = analyzeWorkloadRange(deliverables, startDate, endDate)

  if (analyses.length === 0) return null

  return analyses.reduce((busiest, current) =>
    current.totalDeliverables > busiest.totalDeliverables ? current : busiest
  )
}

/**
 * Suggest better dates for a deliverable based on workload
 */
export function suggestLessLoadedDates(
  deliverables: Deliverable[],
  aroundDate: string,
  daysRange: number = 7
): string[] {
  const startDate = addDays(aroundDate, -daysRange)
  const endDate = addDays(aroundDate, daysRange)
  const dates = getDateRange(startDate, endDate)

  const dateWorkloads = dates.map(date => ({
    date,
    count: analyzeWorkloadForDate(deliverables, date).totalDeliverables
  }))

  // Sort by workload (ascending)
  dateWorkloads.sort((a, b) => a.count - b.count)

  // Return top 3 least loaded dates
  return dateWorkloads.slice(0, 3).map(d => d.date)
}

/**
 * Get campaign workload summary
 */
export function getCampaignWorkloadSummary(
  campaign: Campaign,
  deliverables: Deliverable[]
): {
  totalDeliverables: number
  pendingDeliverables: number
  completedDeliverables: number
  overdueDeliverables: number
  nextDeadline: string | null
  estimatedWorkloadDays: number
} {
  const today = new Date().toISOString().split('T')[0]

  const totalCount = deliverables.reduce((sum, d) => sum + (d.quantity || 1), 0)

  const pending = deliverables.filter(d =>
    !['approved', 'published'].includes(d.status)
  )
  const completed = deliverables.filter(d =>
    ['approved', 'published'].includes(d.status)
  )
  const overdue = pending.filter(d =>
    d.due_date && d.due_date < today
  )

  const pendingCount = pending.reduce((sum, d) => sum + (d.quantity || 1), 0)
  const completedCount = completed.reduce((sum, d) => sum + (d.quantity || 1), 0)
  const overdueCount = overdue.reduce((sum, d) => sum + (d.quantity || 1), 0)

  // Find next deadline
  const upcoming = pending
    .filter(d => d.due_date && d.due_date >= today)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())

  const nextDeadline = upcoming[0]?.due_date || null

  // Estimate work days (rough: 2 deliverables per day max)
  const estimatedWorkloadDays = Math.ceil(pendingCount / 2)

  return {
    totalDeliverables: totalCount,
    pendingDeliverables: pendingCount,
    completedDeliverables: completedCount,
    overdueDeliverables: overdueCount,
    nextDeadline,
    estimatedWorkloadDays,
  }
}

// Helper functions
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  let current = new Date(startDate)
  const end = new Date(endDate)

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }

  return dates
}

function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function getMonday(date: string): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}
