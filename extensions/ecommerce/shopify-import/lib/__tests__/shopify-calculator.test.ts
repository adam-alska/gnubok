import { describe, it, expect } from 'vitest'
import {
  calculateShopifyStats,
  calculatePaymentBreakdown,
  calculateFulfillmentBreakdown,
  calculateMonthlyVat,
  filterOrdersByDateRange,
  parseCsvNumber,
  type ShopifyOrder,
} from '../shopify-calculator'

function makeOrder(overrides: Partial<ShopifyOrder> = {}): ShopifyOrder {
  return {
    id: 'order-1',
    createdAt: '2025-03-15T10:00:00Z',
    total: 1250,
    subtotal: 1000,
    shipping: 0,
    taxes: 250,
    paymentMethod: 'Shopify Payments',
    fulfillmentStatus: 'fulfilled',
    ...overrides,
  }
}

describe('calculateShopifyStats', () => {
  it('calculates order count, revenue, and AOV correctly', () => {
    const orders = [
      makeOrder({ id: '1', total: 500, subtotal: 400, taxes: 100 }),
      makeOrder({ id: '2', total: 1500, subtotal: 1200, taxes: 300 }),
    ]

    const stats = calculateShopifyStats(orders)

    expect(stats.orderCount).toBe(2)
    expect(stats.totalRevenue).toBe(2000)
    expect(stats.aov).toBe(1000)
    expect(stats.totalTaxes).toBe(400)
    expect(stats.totalSubtotal).toBe(1600)
  })

  it('returns all zeros for empty orders', () => {
    const stats = calculateShopifyStats([])

    expect(stats.orderCount).toBe(0)
    expect(stats.totalRevenue).toBe(0)
    expect(stats.aov).toBe(0)
    expect(stats.totalTaxes).toBe(0)
    expect(stats.totalSubtotal).toBe(0)
    expect(stats.avgVatRate).toBe(0)
  })

  it('calculates average VAT rate correctly', () => {
    const orders = [
      makeOrder({ id: '1', subtotal: 800, taxes: 200 }),
      makeOrder({ id: '2', subtotal: 1200, taxes: 300 }),
    ]

    const stats = calculateShopifyStats(orders)

    // Total taxes: 500, total subtotal: 2000 -> 500/2000*100 = 25
    expect(stats.avgVatRate).toBe(25)
  })

  it('returns avgVatRate 0 when subtotal is zero', () => {
    const orders = [
      makeOrder({ id: '1', total: 0, subtotal: 0, taxes: 0 }),
    ]

    const stats = calculateShopifyStats(orders)

    expect(stats.avgVatRate).toBe(0)
  })
})

describe('calculatePaymentBreakdown', () => {
  it('groups orders by payment method with count and total', () => {
    const orders = [
      makeOrder({ id: '1', total: 500, paymentMethod: 'Klarna' }),
      makeOrder({ id: '2', total: 800, paymentMethod: 'Shopify Payments' }),
      makeOrder({ id: '3', total: 300, paymentMethod: 'Klarna' }),
      makeOrder({ id: '4', total: 200, paymentMethod: 'PayPal' }),
    ]

    const breakdown = calculatePaymentBreakdown(orders)

    expect(breakdown).toEqual([
      { method: 'Klarna', count: 2, total: 800 },
      { method: 'PayPal', count: 1, total: 200 },
      { method: 'Shopify Payments', count: 1, total: 800 },
    ])
  })
})

describe('calculateFulfillmentBreakdown', () => {
  it('groups orders by fulfillment status', () => {
    const orders = [
      makeOrder({ id: '1', fulfillmentStatus: 'fulfilled' }),
      makeOrder({ id: '2', fulfillmentStatus: 'unfulfilled' }),
      makeOrder({ id: '3', fulfillmentStatus: 'fulfilled' }),
      makeOrder({ id: '4', fulfillmentStatus: 'partial' }),
      makeOrder({ id: '5', fulfillmentStatus: 'unfulfilled' }),
    ]

    const breakdown = calculateFulfillmentBreakdown(orders)

    expect(breakdown).toEqual([
      { status: 'fulfilled', count: 2 },
      { status: 'partial', count: 1 },
      { status: 'unfulfilled', count: 2 },
    ])
  })
})

describe('calculateMonthlyVat', () => {
  it('calculates monthly VAT breakdown sorted chronologically', () => {
    const orders = [
      makeOrder({ id: '1', createdAt: '2025-01-10T10:00:00Z', subtotal: 800, taxes: 200 }),
      makeOrder({ id: '2', createdAt: '2025-01-20T10:00:00Z', subtotal: 400, taxes: 100 }),
      makeOrder({ id: '3', createdAt: '2025-03-05T10:00:00Z', subtotal: 1000, taxes: 250 }),
    ]

    const monthly = calculateMonthlyVat(orders)

    expect(monthly).toEqual([
      { month: '2025-01', taxes: 300, subtotal: 1200, vatRate: 25 },
      { month: '2025-03', taxes: 250, subtotal: 1000, vatRate: 25 },
    ])
  })
})

describe('filterOrdersByDateRange', () => {
  it('includes orders within the date range and excludes those outside', () => {
    const orders = [
      makeOrder({ id: '1', createdAt: '2025-01-01T08:00:00Z' }),
      makeOrder({ id: '2', createdAt: '2025-01-15T12:00:00Z' }),
      makeOrder({ id: '3', createdAt: '2025-01-31T23:59:59Z' }),
      makeOrder({ id: '4', createdAt: '2025-02-01T00:00:00Z' }),
      makeOrder({ id: '5', createdAt: '2024-12-31T23:59:59Z' }),
    ]

    const filtered = filterOrdersByDateRange(orders, '2025-01-01', '2025-01-31')

    expect(filtered.map(o => o.id)).toEqual(['1', '2', '3'])
  })
})

describe('parseCsvNumber', () => {
  it('parses Swedish-style number with spaces and comma decimal', () => {
    expect(parseCsvNumber('1 234,56')).toBe(1234.56)
  })

  it('parses standard dot-decimal notation', () => {
    expect(parseCsvNumber('1234.56')).toBe(1234.56)
  })

  it('returns 0 for empty string', () => {
    expect(parseCsvNumber('')).toBe(0)
  })

  it('rounds monetary values to two decimal places', () => {
    // 1234.567 should round to 1234.57
    expect(parseCsvNumber('1234.567')).toBe(1234.57)
    // 99.999 should round to 100.00
    expect(parseCsvNumber('99.999')).toBe(100)
  })
})
