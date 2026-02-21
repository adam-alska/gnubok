/**
 * Pure calculation functions for billable hours tracking.
 * No side effects, no database calls — just math on time entries.
 */

export interface TimeEntry {
  date: string
  projectId: string
  hours: number
  billable: boolean
}

export interface UtilizationKPIs {
  totalHours: number
  billableHours: number
  nonBillableHours: number
  utilization: number       // billable / total * 100, or 0
  effectiveRate: number     // (billableHours * hourlyRate) / totalHours, or 0
  revenue: number           // billableHours * hourlyRate
}

export interface ProjectTimeStats {
  projectId: string
  totalHours: number
  billableHours: number
  utilization: number
}

export interface WeeklyGrid {
  projects: { projectId: string; days: number[] }[]  // days[0..6] = Mon..Sun
  dayTotals: number[]  // 7 day totals
}

export interface MonthlyPeriodSummary {
  month: string
  billableHours: number
  nonBillableHours: number
  totalHours: number
  revenue: number
}

/**
 * Calculate utilization KPIs for a set of time entries.
 */
export function calculateUtilization(
  entries: TimeEntry[],
  hourlyRate: number
): UtilizationKPIs {
  const totalHours = Math.round(
    entries.reduce((sum, e) => sum + e.hours, 0) * 100
  ) / 100

  const billableHours = Math.round(
    entries.filter(e => e.billable).reduce((sum, e) => sum + e.hours, 0) * 100
  ) / 100

  const nonBillableHours = Math.round((totalHours - billableHours) * 100) / 100

  const utilization = totalHours > 0
    ? Math.round((billableHours / totalHours) * 10000) / 100
    : 0

  const revenue = Math.round(billableHours * hourlyRate * 100) / 100

  const effectiveRate = totalHours > 0
    ? Math.round((revenue / totalHours) * 100) / 100
    : 0

  return {
    totalHours,
    billableHours,
    nonBillableHours,
    utilization,
    effectiveRate,
    revenue,
  }
}

/**
 * Calculate per-project time statistics.
 */
export function calculateProjectTimeStats(
  entries: TimeEntry[]
): ProjectTimeStats[] {
  const projectMap = new Map<string, { total: number; billable: number }>()

  for (const entry of entries) {
    const existing = projectMap.get(entry.projectId) ?? { total: 0, billable: 0 }
    existing.total += entry.hours
    if (entry.billable) {
      existing.billable += entry.hours
    }
    projectMap.set(entry.projectId, existing)
  }

  return Array.from(projectMap.entries()).map(([projectId, stats]) => {
    const totalHours = Math.round(stats.total * 100) / 100
    const billableHours = Math.round(stats.billable * 100) / 100
    const utilization = totalHours > 0
      ? Math.round((billableHours / totalHours) * 10000) / 100
      : 0

    return { projectId, totalHours, billableHours, utilization }
  })
}

/**
 * Build a weekly timesheet grid for the given week dates (7 date strings,
 * Mon-Sun) and project IDs. Each project row has 7 day values. dayTotals
 * sums all projects per day.
 */
export function buildWeeklyGrid(
  entries: TimeEntry[],
  weekDates: string[],
  projectIds: string[]
): WeeklyGrid {
  const dateIndex = new Map<string, number>()
  for (let i = 0; i < weekDates.length; i++) {
    dateIndex.set(weekDates[i], i)
  }

  const projects = projectIds.map(projectId => {
    const days = [0, 0, 0, 0, 0, 0, 0]

    for (const entry of entries) {
      if (entry.projectId !== projectId) continue
      const idx = dateIndex.get(entry.date)
      if (idx !== undefined) {
        days[idx] = Math.round((days[idx] + entry.hours) * 100) / 100
      }
    }

    return { projectId, days }
  })

  const dayTotals = [0, 0, 0, 0, 0, 0, 0]
  for (const project of projects) {
    for (let i = 0; i < 7; i++) {
      dayTotals[i] = Math.round((dayTotals[i] + project.days[i]) * 100) / 100
    }
  }

  return { projects, dayTotals }
}

/**
 * Calculate monthly period summaries, grouped by YYYY-MM.
 */
export function calculateMonthlySummary(
  entries: TimeEntry[],
  hourlyRate: number
): MonthlyPeriodSummary[] {
  const monthMap = new Map<string, { billable: number; nonBillable: number }>()

  for (const entry of entries) {
    // Extract YYYY-MM from the date string
    const month = entry.date.substring(0, 7)
    const existing = monthMap.get(month) ?? { billable: 0, nonBillable: 0 }

    if (entry.billable) {
      existing.billable += entry.hours
    } else {
      existing.nonBillable += entry.hours
    }

    monthMap.set(month, existing)
  }

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, stats]) => {
      const billableHours = Math.round(stats.billable * 100) / 100
      const nonBillableHours = Math.round(stats.nonBillable * 100) / 100
      const totalHours = Math.round((billableHours + nonBillableHours) * 100) / 100
      const revenue = Math.round(billableHours * hourlyRate * 100) / 100

      return { month, billableHours, nonBillableHours, totalHours, revenue }
    })
}

/**
 * Get the effective rate for a project. A project-specific rate overrides
 * the global rate. If the project rate is undefined, fall back to the global rate.
 */
export function getEffectiveRate(
  projectRate: number | undefined,
  globalRate: number
): number {
  return projectRate !== undefined ? projectRate : globalRate
}
