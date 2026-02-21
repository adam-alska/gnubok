/**
 * Pure calculation functions for the Tip Tracking extension.
 * Handles tip summaries, per-employee totals, pool distribution
 * (equal, hours-based, custom percentage), and monthly trends.
 *
 * All monetary values use Math.round(x * 100) / 100 for precision.
 */

export interface TipEntry {
  date: string
  shift: string
  employeeId: string
  employeeName: string
  amount: number
}

export interface TipSummary {
  totalTips: number
  avgPerShift: number
  entryCount: number
}

export interface EmployeeTipSummary {
  employeeId: string
  name: string
  total: number
  count: number
  average: number
}

export interface PoolDistribution {
  employeeId: string
  name: string
  share: number
}

/**
 * Calculate tip summary for a set of entries.
 * Returns total tips, average per shift, and entry count.
 */
export function calculateTipSummary(entries: TipEntry[]): TipSummary {
  if (entries.length === 0) {
    return { totalTips: 0, avgPerShift: 0, entryCount: 0 }
  }

  const totalTips = entries.reduce((sum, e) => sum + e.amount, 0)
  const roundedTotal = Math.round(totalTips * 100) / 100
  const avgPerShift = Math.round((roundedTotal / entries.length) * 100) / 100

  return {
    totalTips: roundedTotal,
    avgPerShift,
    entryCount: entries.length,
  }
}

/**
 * Calculate per-employee totals from tip entries.
 * Groups entries by employeeId and returns sorted by total descending.
 */
export function calculateEmployeeTotals(entries: TipEntry[]): EmployeeTipSummary[] {
  const map = new Map<string, { name: string; total: number; count: number }>()

  for (const entry of entries) {
    const existing = map.get(entry.employeeId)
    if (existing) {
      existing.total += entry.amount
      existing.count += 1
    } else {
      map.set(entry.employeeId, {
        name: entry.employeeName,
        total: entry.amount,
        count: 1,
      })
    }
  }

  const results: EmployeeTipSummary[] = []
  for (const [employeeId, data] of map) {
    const total = Math.round(data.total * 100) / 100
    const average = Math.round((total / data.count) * 100) / 100
    results.push({
      employeeId,
      name: data.name,
      total,
      count: data.count,
      average,
    })
  }

  return results.sort((a, b) => b.total - a.total)
}

/**
 * Calculate pool distribution using equal split.
 * Each employee receives an equal share of the pool amount.
 */
export function calculateEqualSplit(
  poolAmount: number,
  employees: { id: string; name: string }[]
): PoolDistribution[] {
  if (employees.length === 0) {
    return []
  }

  const share = Math.round((poolAmount / employees.length) * 100) / 100

  return employees.map(e => ({
    employeeId: e.id,
    name: e.name,
    share,
  }))
}

/**
 * Calculate pool distribution by hours worked.
 * Each employee's share is proportional to their hours.
 * Employees with zero hours receive zero.
 */
export function calculateHoursSplit(
  poolAmount: number,
  employeeHours: { id: string; name: string; hours: number }[]
): PoolDistribution[] {
  if (employeeHours.length === 0) {
    return []
  }

  const totalHours = employeeHours.reduce((sum, e) => sum + e.hours, 0)

  if (totalHours === 0) {
    return employeeHours.map(e => ({
      employeeId: e.id,
      name: e.name,
      share: 0,
    }))
  }

  return employeeHours.map(e => ({
    employeeId: e.id,
    name: e.name,
    share: Math.round((poolAmount * (e.hours / totalHours)) * 100) / 100,
  }))
}

/**
 * Calculate pool distribution by custom percentages.
 * Each employee's share is determined by their assigned percentage.
 * Percentages do not need to sum to 100 — each is applied independently.
 */
export function calculateCustomSplit(
  poolAmount: number,
  employeePcts: { id: string; name: string; pct: number }[]
): PoolDistribution[] {
  return employeePcts.map(e => ({
    employeeId: e.id,
    name: e.name,
    share: Math.round((poolAmount * (e.pct / 100)) * 100) / 100,
  }))
}

/**
 * Calculate monthly trend — total tips per month.
 * Returns an array sorted by month (YYYY-MM) in ascending order.
 */
export function calculateMonthlyTipTrend(entries: TipEntry[]): { month: string; total: number }[] {
  const map = new Map<string, number>()

  for (const entry of entries) {
    // Extract YYYY-MM from date string
    const month = entry.date.substring(0, 7)
    map.set(month, (map.get(month) ?? 0) + entry.amount)
  }

  const results: { month: string; total: number }[] = []
  for (const [month, total] of map) {
    results.push({ month, total: Math.round(total * 100) / 100 })
  }

  return results.sort((a, b) => a.month.localeCompare(b.month))
}
