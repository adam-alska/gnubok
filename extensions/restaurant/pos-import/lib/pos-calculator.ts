/**
 * Pure calculation functions for the POS Import extension.
 *
 * Computes summary statistics, payment method trends, and validation
 * for daily POS (point-of-sale) sales data imported from restaurant
 * cash register systems.
 *
 * All monetary calculations use Math.round(x * 100) / 100 per project convention.
 */

export interface DailySale {
  date: string
  total: number
  cash: number
  card: number
  swish: number
  vat: number
}

export interface PosSummary {
  totalSales: number
  avgPerDay: number
  totalCash: number
  totalCard: number
  totalSwish: number
  totalVat: number
  cashPercent: number
  cardPercent: number
  swishPercent: number
  avgVatRate: number
  dayCount: number
}

export interface PaymentMethodTrend {
  month: string
  cash: number
  card: number
  swish: number
  cashPct: number
  cardPct: number
  swishPct: number
}

/**
 * Calculate summary statistics from daily sales data.
 *
 * Returns totals, averages, and payment method percentage breakdowns.
 * All monetary values are rounded to 2 decimal places.
 * Percentages are rounded to 2 decimal places.
 */
export function calculatePosSummary(sales: DailySale[]): PosSummary {
  if (sales.length === 0) {
    return {
      totalSales: 0,
      avgPerDay: 0,
      totalCash: 0,
      totalCard: 0,
      totalSwish: 0,
      totalVat: 0,
      cashPercent: 0,
      cardPercent: 0,
      swishPercent: 0,
      avgVatRate: 0,
      dayCount: 0,
    }
  }

  const totalSales = sales.reduce((sum, d) => sum + d.total, 0)
  const totalCash = sales.reduce((sum, d) => sum + d.cash, 0)
  const totalCard = sales.reduce((sum, d) => sum + d.card, 0)
  const totalSwish = sales.reduce((sum, d) => sum + d.swish, 0)
  const totalVat = sales.reduce((sum, d) => sum + d.vat, 0)
  const avgPerDay = Math.round(totalSales / sales.length * 100) / 100

  const cashPercent = totalSales > 0
    ? Math.round(totalCash / totalSales * 10000) / 100
    : 0
  const cardPercent = totalSales > 0
    ? Math.round(totalCard / totalSales * 10000) / 100
    : 0
  const swishPercent = totalSales > 0
    ? Math.round(totalSwish / totalSales * 10000) / 100
    : 0
  const avgVatRate = totalSales > 0
    ? Math.round(totalVat / totalSales * 10000) / 100
    : 0

  return {
    totalSales: Math.round(totalSales * 100) / 100,
    avgPerDay,
    totalCash: Math.round(totalCash * 100) / 100,
    totalCard: Math.round(totalCard * 100) / 100,
    totalSwish: Math.round(totalSwish * 100) / 100,
    totalVat: Math.round(totalVat * 100) / 100,
    cashPercent,
    cardPercent,
    swishPercent,
    avgVatRate,
    dayCount: sales.length,
  }
}

/**
 * Validate that the payment method breakdown matches the total.
 *
 * Returns a warning message if the sum of cash + card + swish differs
 * from the total by more than 5%. Returns null if within tolerance
 * or if the total is zero.
 */
export function validatePaymentBreakdown(
  total: number,
  cash: number,
  card: number,
  swish: number
): string | null {
  if (total <= 0) return null

  const paymentSum = Math.round((cash + card + swish) * 100) / 100
  const roundedTotal = Math.round(total * 100) / 100

  if (paymentSum === 0) return null

  const diffPct = Math.round(
    Math.abs(paymentSum - roundedTotal) / roundedTotal * 10000
  ) / 100

  if (diffPct > 5) {
    return `Payment breakdown (${paymentSum}) differs from total (${roundedTotal}) by ${diffPct}%`
  }

  return null
}

/**
 * Calculate monthly payment method trends from daily sales data.
 *
 * Groups sales by month (YYYY-MM) and computes the absolute amounts
 * and percentage share for each payment method. Results are sorted
 * in descending chronological order (newest month first).
 */
export function calculatePaymentTrend(sales: DailySale[]): PaymentMethodTrend[] {
  if (sales.length === 0) return []

  const map = new Map<string, { cash: number; card: number; swish: number; total: number }>()

  for (const d of sales) {
    const month = d.date.slice(0, 7)
    const existing = map.get(month) ?? { cash: 0, card: 0, swish: 0, total: 0 }
    existing.cash += d.cash
    existing.card += d.card
    existing.swish += d.swish
    existing.total += d.total
    map.set(month, existing)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, vals]) => ({
      month,
      cash: Math.round(vals.cash * 100) / 100,
      card: Math.round(vals.card * 100) / 100,
      swish: Math.round(vals.swish * 100) / 100,
      cashPct: vals.total > 0 ? Math.round(vals.cash / vals.total * 10000) / 100 : 0,
      cardPct: vals.total > 0 ? Math.round(vals.card / vals.total * 10000) / 100 : 0,
      swishPct: vals.total > 0 ? Math.round(vals.swish / vals.total * 10000) / 100 : 0,
    }))
}

/**
 * Check if a VAT rate falls within the expected range for Swedish restaurants.
 *
 * Swedish restaurant VAT is typically 12% on food and 25% on alcohol.
 * The blended effective rate on total sales (including VAT) usually
 * falls between 20% and 30%. Returns true if within that range.
 *
 * A subtotal of zero returns false (cannot determine rate).
 */
export function isVatRateInRange(vatAmount: number, subtotal: number): boolean {
  if (subtotal <= 0) return false

  const rate = Math.round(vatAmount / subtotal * 10000) / 100
  return rate >= 20 && rate <= 30
}
