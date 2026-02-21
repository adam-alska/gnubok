import { describe, it, expect } from 'vitest'
import {
  calculateProjectStats,
  calculateCategoryBreakdown,
  filterByDateRange,
  getBudgetStatus,
  type CostEntry,
  type RevenueEntry,
} from '../project-cost-calculator'

describe('calculateProjectStats', () => {
  it('calculates basic project stats correctly', () => {
    const costs: CostEntry[] = [
      { projectId: 'p1', amount: 200000, date: '2025-03-01', category: 'materials' },
      { projectId: 'p1', amount: 100000, date: '2025-03-15', category: 'labor' },
    ]
    const revenues: RevenueEntry[] = [
      { projectId: 'p1', amount: 500000, date: '2025-03-20' },
    ]

    const stats = calculateProjectStats(costs, revenues, 400000)

    expect(stats.totalCost).toBe(300000)
    expect(stats.totalRevenue).toBe(500000)
    // margin: (500000 - 300000) / 500000 * 100 = 40
    expect(stats.margin).toBe(40)
    // budgetUsed: 300000 / 400000 * 100 = 75
    expect(stats.budgetUsed).toBe(75)
    expect(stats.budgetStatus).toBe('ok')
  })

  it('returns margin 0 when revenue is zero', () => {
    const costs: CostEntry[] = [
      { projectId: 'p1', amount: 50000, date: '2025-01-10', category: 'materials' },
    ]
    const revenues: RevenueEntry[] = []

    const stats = calculateProjectStats(costs, revenues, 100000)

    expect(stats.totalCost).toBe(50000)
    expect(stats.totalRevenue).toBe(0)
    expect(stats.margin).toBe(0)
  })

  it('returns negative margin when costs exceed revenue', () => {
    const costs: CostEntry[] = [
      { projectId: 'p1', amount: 150000, date: '2025-02-01', category: 'labor' },
    ]
    const revenues: RevenueEntry[] = [
      { projectId: 'p1', amount: 100000, date: '2025-02-15' },
    ]

    const stats = calculateProjectStats(costs, revenues, 200000)

    // margin: (100000 - 150000) / 100000 * 100 = -50
    expect(stats.margin).toBe(-50)
  })

  it('caps budgetUsed at 100 when costs exceed budget', () => {
    const costs: CostEntry[] = [
      { projectId: 'p1', amount: 210000, date: '2025-04-01', category: 'materials' },
    ]
    const revenues: RevenueEntry[] = [
      { projectId: 'p1', amount: 300000, date: '2025-04-10' },
    ]

    const stats = calculateProjectStats(costs, revenues, 200000)

    // raw budgetUsed: 210000 / 200000 * 100 = 105, capped at 100
    expect(stats.budgetUsed).toBe(100)
    expect(stats.budgetStatus).toBe('danger')
  })

  it('returns zero stats for empty arrays', () => {
    const stats = calculateProjectStats([], [], 100000)

    expect(stats.totalCost).toBe(0)
    expect(stats.totalRevenue).toBe(0)
    expect(stats.margin).toBe(0)
    expect(stats.budgetUsed).toBe(0)
    expect(stats.budgetStatus).toBe('ok')
  })

  it('handles monetary rounding edge cases', () => {
    const costs: CostEntry[] = [
      { projectId: 'p1', amount: 33333.33, date: '2025-01-01', category: 'materials' },
      { projectId: 'p1', amount: 33333.33, date: '2025-01-02', category: 'labor' },
      { projectId: 'p1', amount: 33333.34, date: '2025-01-03', category: 'equipment' },
    ]
    const revenues: RevenueEntry[] = [
      { projectId: 'p1', amount: 200000, date: '2025-01-15' },
    ]

    const stats = calculateProjectStats(costs, revenues, 150000)

    // totalCost: 33333.33 + 33333.33 + 33333.34 = 100000.00
    expect(stats.totalCost).toBe(100000)
    expect(stats.totalRevenue).toBe(200000)
    // margin: (200000 - 100000) / 200000 * 100 = 50
    expect(stats.margin).toBe(50)
  })
})

describe('getBudgetStatus', () => {
  it('returns ok when budget used is below 80%', () => {
    expect(getBudgetStatus(0)).toBe('ok')
    expect(getBudgetStatus(50)).toBe('ok')
    expect(getBudgetStatus(79.99)).toBe('ok')
  })

  it('returns warning when budget used is between 80% and 99.99%', () => {
    expect(getBudgetStatus(80)).toBe('warning')
    expect(getBudgetStatus(85)).toBe('warning')
    expect(getBudgetStatus(99.99)).toBe('warning')
  })

  it('returns danger when budget used is 100% or above', () => {
    expect(getBudgetStatus(100)).toBe('danger')
    expect(getBudgetStatus(105)).toBe('danger')
    expect(getBudgetStatus(200)).toBe('danger')
  })
})

describe('calculateCategoryBreakdown', () => {
  it('breaks down costs by category with correct percentages', () => {
    const costs: CostEntry[] = [
      { projectId: 'p1', amount: 60000, date: '2025-01-01', category: 'materials' },
      { projectId: 'p1', amount: 30000, date: '2025-01-05', category: 'labor' },
      { projectId: 'p1', amount: 10000, date: '2025-01-10', category: 'equipment' },
    ]

    const breakdown = calculateCategoryBreakdown(costs)

    expect(breakdown).toHaveLength(3)
    // Sorted by amount descending
    expect(breakdown[0]).toEqual({ category: 'materials', amount: 60000, percent: 60 })
    expect(breakdown[1]).toEqual({ category: 'labor', amount: 30000, percent: 30 })
    expect(breakdown[2]).toEqual({ category: 'equipment', amount: 10000, percent: 10 })
  })

  it('returns single category as 100%', () => {
    const costs: CostEntry[] = [
      { projectId: 'p1', amount: 25000, date: '2025-01-01', category: 'labor' },
      { projectId: 'p1', amount: 75000, date: '2025-01-05', category: 'labor' },
    ]

    const breakdown = calculateCategoryBreakdown(costs)

    expect(breakdown).toHaveLength(1)
    expect(breakdown[0]).toEqual({ category: 'labor', amount: 100000, percent: 100 })
  })

  it('returns empty array for empty costs', () => {
    const breakdown = calculateCategoryBreakdown([])

    expect(breakdown).toEqual([])
  })
})

describe('filterByDateRange', () => {
  const entries: CostEntry[] = [
    { projectId: 'p1', amount: 1000, date: '2025-01-15', category: 'materials' },
    { projectId: 'p1', amount: 2000, date: '2025-02-15', category: 'labor' },
    { projectId: 'p1', amount: 3000, date: '2025-03-15', category: 'equipment' },
  ]

  it('includes entries within the date range', () => {
    const filtered = filterByDateRange(entries, '2025-01-01', '2025-02-28')

    expect(filtered).toHaveLength(2)
    expect(filtered[0].date).toBe('2025-01-15')
    expect(filtered[1].date).toBe('2025-02-15')
  })

  it('excludes entries outside the date range', () => {
    const filtered = filterByDateRange(entries, '2025-04-01', '2025-04-30')

    expect(filtered).toHaveLength(0)
  })

  it('includes entries on boundary dates', () => {
    const filtered = filterByDateRange(entries, '2025-01-15', '2025-03-15')

    expect(filtered).toHaveLength(3)
  })
})
