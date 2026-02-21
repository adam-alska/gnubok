import { describe, it, expect } from 'vitest'
import {
  calculateProjectBillingStats,
  calculateAggregateStats,
  type BillingEntry,
  type CostEntry,
} from '../billing-calculator'

describe('calculateProjectBillingStats', () => {
  const makeBilling = (overrides: Partial<BillingEntry> = {}): BillingEntry => ({
    projectId: 'proj-1',
    amount: 10000,
    date: '2025-03-15',
    invoiced: true,
    ...overrides,
  })

  const makeCost = (overrides: Partial<CostEntry> = {}): CostEntry => ({
    projectId: 'proj-1',
    amount: 5000,
    date: '2025-03-10',
    category: 'labor',
    ...overrides,
  })

  it('calculates CORRECT margin as (revenue - costs) / revenue * 100', () => {
    const billings = [makeBilling({ amount: 100000 })]
    const costs = [makeCost({ amount: 60000 })]

    const result = calculateProjectBillingStats(billings, costs, 200000)

    // Margin = (100000 - 60000) / 100000 * 100 = 40%
    expect(result.margin).toBe(40)
    // NOT the buggy formula: (budget - billed) / budget = (200000 - 100000) / 200000 = 50%
    expect(result.margin).not.toBe(50)
  })

  it('returns 100% margin when there are no costs', () => {
    const billings = [makeBilling({ amount: 80000 })]
    const costs: CostEntry[] = []

    const result = calculateProjectBillingStats(billings, costs, 100000)

    // (80000 - 0) / 80000 * 100 = 100%
    expect(result.margin).toBe(100)
    expect(result.totalCosts).toBe(0)
  })

  it('returns negative margin when costs exceed revenue', () => {
    const billings = [makeBilling({ amount: 50000 })]
    const costs = [makeCost({ amount: 75000 })]

    const result = calculateProjectBillingStats(billings, costs, 100000)

    // (50000 - 75000) / 50000 * 100 = -50%
    expect(result.margin).toBe(-50)
  })

  it('returns 0% margin when revenue is zero', () => {
    const billings: BillingEntry[] = []
    const costs = [makeCost({ amount: 10000 })]

    const result = calculateProjectBillingStats(billings, costs, 50000)

    expect(result.margin).toBe(0)
    expect(result.totalBilled).toBe(0)
    expect(result.totalCosts).toBe(10000)
  })

  it('calculates budget used as billed / budget * 100', () => {
    const billings = [makeBilling({ amount: 60000 })]
    const costs: CostEntry[] = []

    const result = calculateProjectBillingStats(billings, costs, 120000)

    // 60000 / 120000 * 100 = 50%
    expect(result.budgetUsed).toBe(50)
  })

  it('caps budget used at 100% when billed exceeds budget', () => {
    const billings = [makeBilling({ amount: 150000 })]
    const costs: CostEntry[] = []

    const result = calculateProjectBillingStats(billings, costs, 100000)

    expect(result.budgetUsed).toBe(100)
  })

  it('calculates budget remaining as max(budget - billed, 0)', () => {
    const billings = [makeBilling({ amount: 70000 })]
    const costs: CostEntry[] = []

    const result = calculateProjectBillingStats(billings, costs, 100000)

    expect(result.budgetRemaining).toBe(30000)
  })

  it('never returns negative budget remaining', () => {
    const billings = [makeBilling({ amount: 120000 })]
    const costs: CostEntry[] = []

    const result = calculateProjectBillingStats(billings, costs, 100000)

    expect(result.budgetRemaining).toBe(0)
  })

  it('sums uninvoiced entries correctly', () => {
    const billings = [
      makeBilling({ amount: 30000, invoiced: true }),
      makeBilling({ amount: 20000, invoiced: false }),
      makeBilling({ amount: 15000, invoiced: false }),
      makeBilling({ amount: 10000, invoiced: true }),
    ]
    const costs: CostEntry[] = []

    const result = calculateProjectBillingStats(billings, costs, 100000)

    expect(result.uninvoicedAmount).toBe(35000)
    expect(result.totalBilled).toBe(75000)
  })

  it('returns 0 uninvoiced when all entries are invoiced', () => {
    const billings = [
      makeBilling({ amount: 25000, invoiced: true }),
      makeBilling({ amount: 15000, invoiced: true }),
    ]
    const costs: CostEntry[] = []

    const result = calculateProjectBillingStats(billings, costs, 50000)

    expect(result.uninvoicedAmount).toBe(0)
  })

  it('returns all zeros for empty billings and costs', () => {
    const result = calculateProjectBillingStats([], [], 100000)

    expect(result.totalBilled).toBe(0)
    expect(result.totalCosts).toBe(0)
    expect(result.margin).toBe(0)
    expect(result.budgetUsed).toBe(0)
    expect(result.budgetRemaining).toBe(100000)
    expect(result.uninvoicedAmount).toBe(0)
  })

  it('rounds monetary values correctly with floating point edge cases', () => {
    const billings = [
      makeBilling({ amount: 33333.33 }),
      makeBilling({ amount: 33333.33 }),
      makeBilling({ amount: 33333.34 }),
    ]
    const costs = [
      makeCost({ amount: 11111.11 }),
      makeCost({ amount: 11111.11 }),
      makeCost({ amount: 11111.11 }),
    ]

    const result = calculateProjectBillingStats(billings, costs, 150000)

    // totalBilled = 100000.00, totalCosts = 33333.33
    expect(result.totalBilled).toBe(100000)
    expect(result.totalCosts).toBe(33333.33)
    // margin = (100000 - 33333.33) / 100000 * 100 = 66.6667 -> 66.67
    expect(result.margin).toBe(66.67)
  })
})

describe('calculateAggregateStats', () => {
  it('aggregates stats across multiple projects', () => {
    const stats = [
      {
        totalBilled: 100000,
        totalCosts: 60000,
        margin: 40,
        budgetUsed: 80,
        budgetRemaining: 25000,
        uninvoicedAmount: 10000,
      },
      {
        totalBilled: 50000,
        totalCosts: 20000,
        margin: 60,
        budgetUsed: 50,
        budgetRemaining: 50000,
        uninvoicedAmount: 5000,
      },
    ]

    const result = calculateAggregateStats(stats)

    expect(result.totalBilled).toBe(150000)
    expect(result.totalCosts).toBe(80000)
    expect(result.avgMargin).toBe(50) // (40 + 60) / 2
    expect(result.totalUninvoiced).toBe(15000)
    expect(result.totalBudgetRemaining).toBe(75000)
  })

  it('returns all zeros for empty project stats', () => {
    const result = calculateAggregateStats([])

    expect(result.totalBilled).toBe(0)
    expect(result.totalCosts).toBe(0)
    expect(result.avgMargin).toBe(0)
    expect(result.totalUninvoiced).toBe(0)
    expect(result.totalBudgetRemaining).toBe(0)
  })
})
