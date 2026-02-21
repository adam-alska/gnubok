/**
 * Calculate earnings per liter of alcohol sold.
 * Earnings Per Liter = Alcohol Revenue / Total Liters Sold
 */
export interface LiterEntry {
  date: string
  liters: number
  type: string // 'spirits' | 'wine' | 'beer'
}

export interface EarningsPerLiterResult {
  totalRevenue: number
  totalLiters: number
  earningsPerLiter: number
  period: { start: string; end: string }
}

export function calculateEarningsPerLiter(
  revenue: number,
  entries: LiterEntry[],
  periodStart: string,
  periodEnd: string
): EarningsPerLiterResult {
  const periodEntries = entries.filter(
    e => e.date >= periodStart && e.date <= periodEnd
  )

  const totalLiters = periodEntries.reduce((sum, e) => sum + e.liters, 0)

  const earningsPerLiter = totalLiters > 0
    ? Math.round((revenue / totalLiters) * 100) / 100
    : 0

  return {
    totalRevenue: Math.round(revenue * 100) / 100,
    totalLiters: Math.round(totalLiters * 100) / 100,
    earningsPerLiter,
    period: { start: periodStart, end: periodEnd },
  }
}
