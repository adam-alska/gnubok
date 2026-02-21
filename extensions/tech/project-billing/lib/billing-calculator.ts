/**
 * Calculate project billing statistics.
 *
 * IMPORTANT: Margin is calculated as (revenue - costs) / revenue * 100.
 * This is the correct gross margin formula. A previous implementation
 * incorrectly used (budget - billed) / budget which conflates budget
 * utilization with profitability.
 */

export interface BillingEntry {
  projectId: string
  amount: number
  date: string
  invoiced: boolean
}

export interface CostEntry {
  projectId: string
  amount: number
  date: string
  category: string
}

export interface ProjectBillingStats {
  totalBilled: number
  totalCosts: number
  margin: number
  budgetUsed: number
  budgetRemaining: number
  uninvoicedAmount: number
}

export interface AggregateStats {
  totalBilled: number
  totalCosts: number
  avgMargin: number
  totalUninvoiced: number
  totalBudgetRemaining: number
}

export function calculateProjectBillingStats(
  billings: BillingEntry[],
  costs: CostEntry[],
  budget: number
): ProjectBillingStats {
  const totalBilled = billings.reduce((sum, b) => sum + b.amount, 0)
  const roundedBilled = Math.round(totalBilled * 100) / 100

  const totalCosts = costs.reduce((sum, c) => sum + c.amount, 0)
  const roundedCosts = Math.round(totalCosts * 100) / 100

  // CORRECT margin formula: (revenue - costs) / revenue * 100
  // Revenue = totalBilled. Returns 0 when there is no revenue.
  const margin = roundedBilled > 0
    ? Math.round(((roundedBilled - roundedCosts) / roundedBilled) * 10000) / 100
    : 0

  const budgetUsedRaw = budget > 0
    ? Math.round((roundedBilled / budget) * 10000) / 100
    : 0
  const budgetUsed = Math.min(budgetUsedRaw, 100)

  const budgetRemaining = Math.round(Math.max(budget - roundedBilled, 0) * 100) / 100

  const uninvoicedAmount = billings
    .filter(b => !b.invoiced)
    .reduce((sum, b) => sum + b.amount, 0)
  const roundedUninvoiced = Math.round(uninvoicedAmount * 100) / 100

  return {
    totalBilled: roundedBilled,
    totalCosts: roundedCosts,
    margin,
    budgetUsed,
    budgetRemaining,
    uninvoicedAmount: roundedUninvoiced,
  }
}

export function calculateAggregateStats(
  projectStats: ProjectBillingStats[]
): AggregateStats {
  if (projectStats.length === 0) {
    return {
      totalBilled: 0,
      totalCosts: 0,
      avgMargin: 0,
      totalUninvoiced: 0,
      totalBudgetRemaining: 0,
    }
  }

  const totalBilled = projectStats.reduce((sum, s) => sum + s.totalBilled, 0)
  const totalCosts = projectStats.reduce((sum, s) => sum + s.totalCosts, 0)
  const totalUninvoiced = projectStats.reduce((sum, s) => sum + s.uninvoicedAmount, 0)
  const totalBudgetRemaining = projectStats.reduce((sum, s) => sum + s.budgetRemaining, 0)

  const avgMargin = projectStats.reduce((sum, s) => sum + s.margin, 0) / projectStats.length

  return {
    totalBilled: Math.round(totalBilled * 100) / 100,
    totalCosts: Math.round(totalCosts * 100) / 100,
    avgMargin: Math.round(avgMargin * 100) / 100,
    totalUninvoiced: Math.round(totalUninvoiced * 100) / 100,
    totalBudgetRemaining: Math.round(totalBudgetRemaining * 100) / 100,
  }
}
