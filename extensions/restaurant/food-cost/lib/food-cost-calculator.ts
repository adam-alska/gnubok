/**
 * Calculate food cost percentage from journal entry line data.
 * Food Cost % = (Food Purchases / Food Revenue) * 100
 *
 * Food purchases: accounts 4000-4999 (varuinkop)
 * Food revenue: accounts 3000-3999 (intakter)
 */
export interface FoodCostResult {
  foodPurchases: number
  foodRevenue: number
  foodCostPercent: number
  period: { start: string; end: string }
}

export interface JournalLineData {
  account_number: string
  debit_amount: number
  credit_amount: number
  entry_date: string
}

export function calculateFoodCost(
  lines: JournalLineData[],
  periodStart: string,
  periodEnd: string
): FoodCostResult {
  const periodLines = lines.filter(
    l => l.entry_date >= periodStart && l.entry_date <= periodEnd
  )

  // Food purchases: debit side of 4000-4999 accounts
  const foodPurchases = periodLines
    .filter(l => l.account_number >= '4000' && l.account_number <= '4999')
    .reduce((sum, l) => sum + l.debit_amount - l.credit_amount, 0)

  // Food revenue: credit side of 3000-3999 accounts
  const foodRevenue = periodLines
    .filter(l => l.account_number >= '3000' && l.account_number <= '3999')
    .reduce((sum, l) => sum + l.credit_amount - l.debit_amount, 0)

  const foodCostPercent = foodRevenue > 0
    ? Math.round((foodPurchases / foodRevenue) * 10000) / 100
    : 0

  return {
    foodPurchases: Math.round(foodPurchases * 100) / 100,
    foodRevenue: Math.round(foodRevenue * 100) / 100,
    foodCostPercent,
    period: { start: periodStart, end: periodEnd },
  }
}
