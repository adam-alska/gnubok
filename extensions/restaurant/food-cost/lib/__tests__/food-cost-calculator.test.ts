import { describe, it, expect } from 'vitest'
import {
  calculateFoodCost,
  type JournalLineData,
} from '../food-cost-calculator'

describe('calculateFoodCost', () => {
  const period = { start: '2025-01-01', end: '2025-01-31' }

  it('calculates food cost percentage correctly', () => {
    const lines: JournalLineData[] = [
      // Food purchases (4010 - varuinkop livsmedel)
      { account_number: '4010', debit_amount: 40000, credit_amount: 0, entry_date: '2025-01-15' },
      // Food revenue (3001 - intakter 25%)
      { account_number: '3001', debit_amount: 0, credit_amount: 100000, entry_date: '2025-01-15' },
    ]

    const result = calculateFoodCost(lines, period.start, period.end)

    expect(result.foodPurchases).toBe(40000)
    expect(result.foodRevenue).toBe(100000)
    expect(result.foodCostPercent).toBe(40)
    expect(result.period).toEqual(period)
  })

  it('returns 0% when revenue is zero', () => {
    const lines: JournalLineData[] = [
      { account_number: '4010', debit_amount: 5000, credit_amount: 0, entry_date: '2025-01-10' },
    ]

    const result = calculateFoodCost(lines, period.start, period.end)

    expect(result.foodPurchases).toBe(5000)
    expect(result.foodRevenue).toBe(0)
    expect(result.foodCostPercent).toBe(0)
  })

  it('returns 0 purchases and 0 revenue when no matching accounts', () => {
    const lines: JournalLineData[] = [
      { account_number: '1930', debit_amount: 10000, credit_amount: 0, entry_date: '2025-01-05' },
      { account_number: '2440', debit_amount: 0, credit_amount: 10000, entry_date: '2025-01-05' },
    ]

    const result = calculateFoodCost(lines, period.start, period.end)

    expect(result.foodPurchases).toBe(0)
    expect(result.foodRevenue).toBe(0)
    expect(result.foodCostPercent).toBe(0)
  })

  it('filters lines by date range correctly', () => {
    const lines: JournalLineData[] = [
      // Inside period
      { account_number: '4010', debit_amount: 20000, credit_amount: 0, entry_date: '2025-01-15' },
      { account_number: '3001', debit_amount: 0, credit_amount: 50000, entry_date: '2025-01-15' },
      // Outside period (February)
      { account_number: '4010', debit_amount: 99999, credit_amount: 0, entry_date: '2025-02-15' },
      { account_number: '3001', debit_amount: 0, credit_amount: 99999, entry_date: '2025-02-15' },
    ]

    const result = calculateFoodCost(lines, period.start, period.end)

    expect(result.foodPurchases).toBe(20000)
    expect(result.foodRevenue).toBe(50000)
    expect(result.foodCostPercent).toBe(40)
  })

  it('handles monetary rounding correctly', () => {
    const lines: JournalLineData[] = [
      { account_number: '4010', debit_amount: 33333.33, credit_amount: 0, entry_date: '2025-01-10' },
      { account_number: '3001', debit_amount: 0, credit_amount: 99999.99, entry_date: '2025-01-10' },
    ]

    const result = calculateFoodCost(lines, period.start, period.end)

    expect(result.foodPurchases).toBe(33333.33)
    expect(result.foodRevenue).toBe(99999.99)
    // 33333.33 / 99999.99 * 100 = 33.333334... -> rounded to 33.33
    expect(result.foodCostPercent).toBe(33.33)
  })

  it('handles multiple purchase and revenue lines', () => {
    const lines: JournalLineData[] = [
      { account_number: '4010', debit_amount: 15000, credit_amount: 0, entry_date: '2025-01-05' },
      { account_number: '4020', debit_amount: 10000, credit_amount: 0, entry_date: '2025-01-10' },
      { account_number: '4010', debit_amount: 0, credit_amount: 2000, entry_date: '2025-01-12' }, // Return/credit
      { account_number: '3001', debit_amount: 0, credit_amount: 60000, entry_date: '2025-01-15' },
      { account_number: '3002', debit_amount: 0, credit_amount: 20000, entry_date: '2025-01-20' },
    ]

    const result = calculateFoodCost(lines, period.start, period.end)

    // Purchases: 15000 + 10000 - 2000 = 23000
    expect(result.foodPurchases).toBe(23000)
    // Revenue: 60000 + 20000 = 80000
    expect(result.foodRevenue).toBe(80000)
    // 23000 / 80000 * 100 = 28.75
    expect(result.foodCostPercent).toBe(28.75)
  })

  it('includes boundary dates in the period', () => {
    const lines: JournalLineData[] = [
      { account_number: '4010', debit_amount: 5000, credit_amount: 0, entry_date: '2025-01-01' },
      { account_number: '4010', debit_amount: 5000, credit_amount: 0, entry_date: '2025-01-31' },
      { account_number: '3001', debit_amount: 0, credit_amount: 50000, entry_date: '2025-01-15' },
    ]

    const result = calculateFoodCost(lines, period.start, period.end)

    expect(result.foodPurchases).toBe(10000)
    expect(result.foodRevenue).toBe(50000)
    expect(result.foodCostPercent).toBe(20)
  })
})
