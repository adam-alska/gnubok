/**
 * Pure calculation functions for the Project Cost extension.
 *
 * Tracks costs, revenues, margins, and budget usage per construction project.
 * All monetary calculations use Math.round(x * 100) / 100 per project rules.
 */

export interface CostEntry {
  projectId: string
  amount: number
  date: string
  category: string
}

export interface RevenueEntry {
  projectId: string
  amount: number
  date: string
}

export interface ProjectStats {
  totalCost: number
  totalRevenue: number
  margin: number // (revenue - cost) / revenue * 100, or 0 if no revenue
  budgetUsed: number // cost / budget * 100, capped at 100
  budgetStatus: 'ok' | 'warning' | 'danger' // ok < 80%, warning >= 80%, danger >= 100%
}

export interface CategoryBreakdown {
  category: string
  amount: number
  percent: number
}

/**
 * Determine budget status based on percentage of budget used.
 * - ok: less than 80%
 * - warning: 80% to below 100%
 * - danger: 100% or above
 */
export function getBudgetStatus(budgetUsedPct: number): 'ok' | 'warning' | 'danger' {
  if (budgetUsedPct >= 100) return 'danger'
  if (budgetUsedPct >= 80) return 'warning'
  return 'ok'
}

/**
 * Calculate project statistics from cost entries, revenue entries, and budget.
 *
 * - totalCost: sum of all cost entry amounts
 * - totalRevenue: sum of all revenue entry amounts
 * - margin: (revenue - cost) / revenue * 100, or 0 when revenue is zero
 * - budgetUsed: cost / budget * 100, capped at 100; 0 if budget <= 0
 * - budgetStatus: derived from budgetUsed via getBudgetStatus
 */
export function calculateProjectStats(
  costs: CostEntry[],
  revenues: RevenueEntry[],
  budget: number
): ProjectStats {
  const totalCost = Math.round(
    costs.reduce((sum, c) => sum + c.amount, 0) * 100
  ) / 100

  const totalRevenue = Math.round(
    revenues.reduce((sum, r) => sum + r.amount, 0) * 100
  ) / 100

  const margin = totalRevenue > 0
    ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 10000) / 100
    : 0

  const rawBudgetUsed = budget > 0
    ? Math.round((totalCost / budget) * 10000) / 100
    : 0

  const budgetUsed = Math.min(rawBudgetUsed, 100)
  const budgetStatus = getBudgetStatus(rawBudgetUsed)

  return {
    totalCost,
    totalRevenue,
    margin,
    budgetUsed,
    budgetStatus,
  }
}

/**
 * Calculate cost breakdown by category.
 *
 * Returns an array of categories sorted by amount descending,
 * each with the category name, total amount, and percentage of total cost.
 * Returns an empty array if there are no costs.
 */
export function calculateCategoryBreakdown(costs: CostEntry[]): CategoryBreakdown[] {
  if (costs.length === 0) return []

  const totalCost = Math.round(
    costs.reduce((sum, c) => sum + c.amount, 0) * 100
  ) / 100

  const categoryMap = new Map<string, number>()
  for (const cost of costs) {
    const current = categoryMap.get(cost.category) ?? 0
    categoryMap.set(cost.category, current + cost.amount)
  }

  const breakdown: CategoryBreakdown[] = []
  for (const [category, rawAmount] of categoryMap) {
    const amount = Math.round(rawAmount * 100) / 100
    const percent = totalCost > 0
      ? Math.round((amount / totalCost) * 10000) / 100
      : 0
    breakdown.push({ category, amount, percent })
  }

  breakdown.sort((a, b) => b.amount - a.amount)

  return breakdown
}

/**
 * Filter entries by date range (inclusive on both ends).
 * Dates are compared as ISO date strings (YYYY-MM-DD).
 */
export function filterByDateRange<T extends { date: string }>(
  entries: T[],
  start: string,
  end: string
): T[] {
  return entries.filter(e => e.date >= start && e.date <= end)
}
