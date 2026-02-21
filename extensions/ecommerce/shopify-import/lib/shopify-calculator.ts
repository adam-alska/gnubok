/**
 * Pure calculation functions for Shopify order import data.
 *
 * Calculates aggregate statistics, payment breakdowns, fulfillment
 * breakdowns, and monthly VAT summaries from imported Shopify orders.
 *
 * All monetary values use Math.round(x * 100) / 100 for precision.
 */

export interface ShopifyOrder {
  id: string
  createdAt: string
  total: number
  subtotal: number
  shipping: number
  taxes: number
  paymentMethod: string
  fulfillmentStatus: string
}

export interface ShopifyStats {
  orderCount: number
  totalRevenue: number
  aov: number
  totalTaxes: number
  totalSubtotal: number
  avgVatRate: number
}

export interface PaymentBreakdown {
  method: string
  count: number
  total: number
}

export interface FulfillmentBreakdown {
  status: string
  count: number
}

export interface MonthlyVat {
  month: string
  taxes: number
  subtotal: number
  vatRate: number
}

/**
 * Calculate overall statistics from a list of Shopify orders.
 * AOV is totalRevenue / orderCount, or 0 if no orders.
 * avgVatRate is (totalTaxes / totalSubtotal) * 100, or 0 if subtotal is zero.
 */
export function calculateShopifyStats(orders: ShopifyOrder[]): ShopifyStats {
  if (orders.length === 0) {
    return {
      orderCount: 0,
      totalRevenue: 0,
      aov: 0,
      totalTaxes: 0,
      totalSubtotal: 0,
      avgVatRate: 0,
    }
  }

  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0)
  const totalTaxes = orders.reduce((sum, o) => sum + o.taxes, 0)
  const totalSubtotal = orders.reduce((sum, o) => sum + o.subtotal, 0)

  const aov = Math.round((totalRevenue / orders.length) * 100) / 100
  const avgVatRate = totalSubtotal > 0
    ? Math.round((totalTaxes / totalSubtotal) * 10000) / 100
    : 0

  return {
    orderCount: orders.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    aov,
    totalTaxes: Math.round(totalTaxes * 100) / 100,
    totalSubtotal: Math.round(totalSubtotal * 100) / 100,
    avgVatRate,
  }
}

/**
 * Group orders by payment method and calculate count and total per method.
 * Returns sorted alphabetically by method name.
 */
export function calculatePaymentBreakdown(orders: ShopifyOrder[]): PaymentBreakdown[] {
  const map = new Map<string, { count: number; total: number }>()

  for (const order of orders) {
    const entry = map.get(order.paymentMethod)
    if (entry) {
      entry.count += 1
      entry.total += order.total
    } else {
      map.set(order.paymentMethod, { count: 1, total: order.total })
    }
  }

  return Array.from(map.entries())
    .map(([method, { count, total }]) => ({
      method,
      count,
      total: Math.round(total * 100) / 100,
    }))
    .sort((a, b) => a.method.localeCompare(b.method))
}

/**
 * Group orders by fulfillment status and calculate count per status.
 * Returns sorted alphabetically by status.
 */
export function calculateFulfillmentBreakdown(orders: ShopifyOrder[]): FulfillmentBreakdown[] {
  const map = new Map<string, number>()

  for (const order of orders) {
    map.set(order.fulfillmentStatus, (map.get(order.fulfillmentStatus) ?? 0) + 1)
  }

  return Array.from(map.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => a.status.localeCompare(b.status))
}

/**
 * Calculate monthly VAT breakdown from orders.
 * Groups by YYYY-MM derived from createdAt, calculates taxes, subtotal,
 * and effective VAT rate per month. Returns sorted chronologically.
 */
export function calculateMonthlyVat(orders: ShopifyOrder[]): MonthlyVat[] {
  const map = new Map<string, { taxes: number; subtotal: number }>()

  for (const order of orders) {
    const month = order.createdAt.slice(0, 7) // YYYY-MM
    const entry = map.get(month)
    if (entry) {
      entry.taxes += order.taxes
      entry.subtotal += order.subtotal
    } else {
      map.set(month, { taxes: order.taxes, subtotal: order.subtotal })
    }
  }

  return Array.from(map.entries())
    .map(([month, { taxes, subtotal }]) => ({
      month,
      taxes: Math.round(taxes * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      vatRate: subtotal > 0
        ? Math.round((taxes / subtotal) * 10000) / 100
        : 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * Filter orders whose createdAt falls within [from, to] inclusive.
 * Comparison is done on the date portion (YYYY-MM-DD) of createdAt.
 */
export function filterOrdersByDateRange(
  orders: ShopifyOrder[],
  from: string,
  to: string
): ShopifyOrder[] {
  return orders.filter(o => {
    const date = o.createdAt.slice(0, 10)
    return date >= from && date <= to
  })
}

/**
 * Parse a numeric value from a CSV string.
 * Handles Swedish-style formatting with spaces as thousands separators
 * and commas as decimal separators (e.g. "1 234,56" -> 1234.56).
 * Also handles standard dot-decimal notation ("1234.56" -> 1234.56).
 * Returns 0 for empty or unparseable strings.
 */
export function parseCsvNumber(value: string): number {
  if (!value || value.trim() === '') {
    return 0
  }

  // Remove whitespace (thousands separators)
  let cleaned = value.replace(/\s/g, '')

  // If the string contains a comma, treat it as a decimal separator
  // (Swedish CSV convention)
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.')
  }

  const result = parseFloat(cleaned)
  if (isNaN(result)) {
    return 0
  }

  return Math.round(result * 100) / 100
}
