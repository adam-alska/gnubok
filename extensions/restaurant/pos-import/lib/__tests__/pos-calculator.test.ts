import { describe, it, expect } from 'vitest'
import {
  calculatePosSummary,
  validatePaymentBreakdown,
  calculatePaymentTrend,
  isVatRateInRange,
  type DailySale,
} from '../pos-calculator'

describe('calculatePosSummary', () => {
  it('calculates summary statistics from multiple days', () => {
    const sales: DailySale[] = [
      { date: '2025-01-01', total: 10000, cash: 2000, card: 5000, swish: 3000, vat: 2400 },
      { date: '2025-01-02', total: 12000, cash: 3000, card: 6000, swish: 3000, vat: 2880 },
      { date: '2025-01-03', total: 8000, cash: 1000, card: 4000, swish: 3000, vat: 1920 },
    ]

    const result = calculatePosSummary(sales)

    expect(result.totalSales).toBe(30000)
    expect(result.avgPerDay).toBe(10000)
    expect(result.totalCash).toBe(6000)
    expect(result.totalCard).toBe(15000)
    expect(result.totalSwish).toBe(9000)
    expect(result.totalVat).toBe(7200)
    expect(result.dayCount).toBe(3)
    // 6000 / 30000 = 20%
    expect(result.cashPercent).toBe(20)
    // 15000 / 30000 = 50%
    expect(result.cardPercent).toBe(50)
    // 9000 / 30000 = 30%
    expect(result.swishPercent).toBe(30)
    // 7200 / 30000 = 24%
    expect(result.avgVatRate).toBe(24)
  })

  it('returns zeroes for an empty sales array', () => {
    const result = calculatePosSummary([])

    expect(result.totalSales).toBe(0)
    expect(result.avgPerDay).toBe(0)
    expect(result.totalCash).toBe(0)
    expect(result.totalCard).toBe(0)
    expect(result.totalSwish).toBe(0)
    expect(result.totalVat).toBe(0)
    expect(result.cashPercent).toBe(0)
    expect(result.cardPercent).toBe(0)
    expect(result.swishPercent).toBe(0)
    expect(result.avgVatRate).toBe(0)
    expect(result.dayCount).toBe(0)
  })

  it('handles monetary rounding edge cases', () => {
    const sales: DailySale[] = [
      { date: '2025-01-01', total: 33333.33, cash: 11111.11, card: 11111.11, swish: 11111.11, vat: 7999.99 },
    ]

    const result = calculatePosSummary(sales)

    expect(result.totalSales).toBe(33333.33)
    expect(result.avgPerDay).toBe(33333.33)
    expect(result.totalCash).toBe(11111.11)
    expect(result.totalCard).toBe(11111.11)
    expect(result.totalSwish).toBe(11111.11)
    expect(result.totalVat).toBe(7999.99)
    // 11111.11 / 33333.33 * 100 = 33.333333... -> 33.33
    expect(result.cashPercent).toBe(33.33)
    expect(result.cardPercent).toBe(33.33)
    expect(result.swishPercent).toBe(33.33)
    // 7999.99 / 33333.33 * 100 = 24.00... -> 24
    expect(result.avgVatRate).toBe(24)
  })

  it('handles a single day with zero total', () => {
    const sales: DailySale[] = [
      { date: '2025-01-01', total: 0, cash: 0, card: 0, swish: 0, vat: 0 },
    ]

    const result = calculatePosSummary(sales)

    expect(result.totalSales).toBe(0)
    expect(result.avgPerDay).toBe(0)
    expect(result.cashPercent).toBe(0)
    expect(result.cardPercent).toBe(0)
    expect(result.swishPercent).toBe(0)
    expect(result.avgVatRate).toBe(0)
    expect(result.dayCount).toBe(1)
  })
})

describe('validatePaymentBreakdown', () => {
  it('returns null when breakdown is within 5% of total', () => {
    // Cash + Card + Swish = 10000, Total = 10000 -> 0% difference
    const result = validatePaymentBreakdown(10000, 3000, 5000, 2000)
    expect(result).toBeNull()
  })

  it('returns null when breakdown differs by exactly 5%', () => {
    // Total = 10000, payment sum = 9500 -> 5% difference (boundary)
    const result = validatePaymentBreakdown(10000, 3000, 4500, 2000)
    expect(result).toBeNull()
  })

  it('returns a warning when breakdown differs by more than 5%', () => {
    // Total = 10000, payment sum = 9000 -> 10% difference
    const result = validatePaymentBreakdown(10000, 2000, 4000, 3000)
    expect(result).not.toBeNull()
    expect(result).toContain('10%')
  })

  it('returns null when total is zero', () => {
    const result = validatePaymentBreakdown(0, 100, 200, 300)
    expect(result).toBeNull()
  })

  it('returns null when all payment methods are zero', () => {
    const result = validatePaymentBreakdown(10000, 0, 0, 0)
    expect(result).toBeNull()
  })

  it('returns a warning with correct amounts in message', () => {
    // Total = 1000, payment sum = 500 -> 50% difference
    const result = validatePaymentBreakdown(1000, 200, 200, 100)
    expect(result).not.toBeNull()
    expect(result).toContain('500')
    expect(result).toContain('1000')
    expect(result).toContain('50%')
  })
})

describe('calculatePaymentTrend', () => {
  it('groups sales by month and calculates percentages', () => {
    const sales: DailySale[] = [
      { date: '2025-01-05', total: 10000, cash: 2000, card: 5000, swish: 3000, vat: 2400 },
      { date: '2025-01-15', total: 10000, cash: 3000, card: 4000, swish: 3000, vat: 2400 },
      { date: '2025-02-10', total: 20000, cash: 4000, card: 10000, swish: 6000, vat: 4800 },
    ]

    const result = calculatePaymentTrend(sales)

    // Sorted descending: February first
    expect(result).toHaveLength(2)
    expect(result[0].month).toBe('2025-02')
    expect(result[1].month).toBe('2025-01')

    // February: single day
    expect(result[0].cash).toBe(4000)
    expect(result[0].card).toBe(10000)
    expect(result[0].swish).toBe(6000)
    // 4000 / 20000 = 20%
    expect(result[0].cashPct).toBe(20)
    // 10000 / 20000 = 50%
    expect(result[0].cardPct).toBe(50)
    // 6000 / 20000 = 30%
    expect(result[0].swishPct).toBe(30)

    // January: two days aggregated
    expect(result[1].cash).toBe(5000)
    expect(result[1].card).toBe(9000)
    expect(result[1].swish).toBe(6000)
    // 5000 / 20000 = 25%
    expect(result[1].cashPct).toBe(25)
    // 9000 / 20000 = 45%
    expect(result[1].cardPct).toBe(45)
    // 6000 / 20000 = 30%
    expect(result[1].swishPct).toBe(30)
  })

  it('returns empty array for empty sales', () => {
    const result = calculatePaymentTrend([])
    expect(result).toEqual([])
  })

  it('handles monetary rounding in trend aggregation', () => {
    const sales: DailySale[] = [
      { date: '2025-03-01', total: 3333.33, cash: 1111.11, card: 1111.11, swish: 1111.11, vat: 800 },
      { date: '2025-03-02', total: 3333.34, cash: 1111.12, card: 1111.11, swish: 1111.11, vat: 800 },
    ]

    const result = calculatePaymentTrend(sales)

    expect(result).toHaveLength(1)
    expect(result[0].month).toBe('2025-03')
    // 1111.11 + 1111.12 = 2222.23
    expect(result[0].cash).toBe(2222.23)
    // 1111.11 + 1111.11 = 2222.22
    expect(result[0].card).toBe(2222.22)
    expect(result[0].swish).toBe(2222.22)
  })
})

describe('isVatRateInRange', () => {
  it('returns true when VAT rate is within 20-30%', () => {
    // 2400 / 10000 = 24%
    expect(isVatRateInRange(2400, 10000)).toBe(true)
  })

  it('returns true at the lower boundary (20%)', () => {
    // 2000 / 10000 = 20%
    expect(isVatRateInRange(2000, 10000)).toBe(true)
  })

  it('returns true at the upper boundary (30%)', () => {
    // 3000 / 10000 = 30%
    expect(isVatRateInRange(3000, 10000)).toBe(true)
  })

  it('returns false when VAT rate is below 20%', () => {
    // 1500 / 10000 = 15%
    expect(isVatRateInRange(1500, 10000)).toBe(false)
  })

  it('returns false when VAT rate is above 30%', () => {
    // 3500 / 10000 = 35%
    expect(isVatRateInRange(3500, 10000)).toBe(false)
  })

  it('returns false when subtotal is zero', () => {
    expect(isVatRateInRange(100, 0)).toBe(false)
  })

  it('returns false when subtotal is negative', () => {
    expect(isVatRateInRange(100, -500)).toBe(false)
  })
})
