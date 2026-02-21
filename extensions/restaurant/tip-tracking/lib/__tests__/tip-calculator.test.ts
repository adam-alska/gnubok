import { describe, it, expect } from 'vitest'
import {
  calculateTipSummary,
  calculateEmployeeTotals,
  calculateEqualSplit,
  calculateHoursSplit,
  calculateCustomSplit,
  calculateMonthlyTipTrend,
  type TipEntry,
} from '../tip-calculator'

describe('calculateTipSummary', () => {
  it('calculates total tips, average per shift, and entry count', () => {
    const entries: TipEntry[] = [
      { date: '2025-01-10', shift: 'lunch', employeeId: 'e1', employeeName: 'Anna', amount: 350 },
      { date: '2025-01-10', shift: 'dinner', employeeId: 'e2', employeeName: 'Björn', amount: 520 },
      { date: '2025-01-11', shift: 'lunch', employeeId: 'e1', employeeName: 'Anna', amount: 430 },
    ]

    const result = calculateTipSummary(entries)

    expect(result.totalTips).toBe(1300)
    expect(result.avgPerShift).toBe(433.33)
    expect(result.entryCount).toBe(3)
  })

  it('returns zeros for an empty entries array', () => {
    const result = calculateTipSummary([])

    expect(result.totalTips).toBe(0)
    expect(result.avgPerShift).toBe(0)
    expect(result.entryCount).toBe(0)
  })
})

describe('calculateEmployeeTotals', () => {
  it('calculates per-employee totals with multiple employees', () => {
    const entries: TipEntry[] = [
      { date: '2025-01-10', shift: 'lunch', employeeId: 'e1', employeeName: 'Anna', amount: 300 },
      { date: '2025-01-10', shift: 'dinner', employeeId: 'e2', employeeName: 'Björn', amount: 500 },
      { date: '2025-01-11', shift: 'lunch', employeeId: 'e1', employeeName: 'Anna', amount: 400 },
      { date: '2025-01-11', shift: 'dinner', employeeId: 'e2', employeeName: 'Björn', amount: 600 },
      { date: '2025-01-12', shift: 'lunch', employeeId: 'e3', employeeName: 'Clara', amount: 250 },
    ]

    const result = calculateEmployeeTotals(entries)

    // Sorted by total descending: Björn (1100), Anna (700), Clara (250)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ employeeId: 'e2', name: 'Björn', total: 1100, count: 2, average: 550 })
    expect(result[1]).toEqual({ employeeId: 'e1', name: 'Anna', total: 700, count: 2, average: 350 })
    expect(result[2]).toEqual({ employeeId: 'e3', name: 'Clara', total: 250, count: 1, average: 250 })
  })

  it('calculates correct average for a single employee', () => {
    const entries: TipEntry[] = [
      { date: '2025-01-10', shift: 'lunch', employeeId: 'e1', employeeName: 'Anna', amount: 333.33 },
      { date: '2025-01-11', shift: 'lunch', employeeId: 'e1', employeeName: 'Anna', amount: 666.67 },
    ]

    const result = calculateEmployeeTotals(entries)

    expect(result).toHaveLength(1)
    expect(result[0].total).toBe(1000)
    expect(result[0].count).toBe(2)
    expect(result[0].average).toBe(500)
  })
})

describe('calculateEqualSplit', () => {
  it('splits pool equally between 2 employees', () => {
    const result = calculateEqualSplit(1000, [
      { id: 'e1', name: 'Anna' },
      { id: 'e2', name: 'Björn' },
    ])

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ employeeId: 'e1', name: 'Anna', share: 500 })
    expect(result[1]).toEqual({ employeeId: 'e2', name: 'Björn', share: 500 })
  })

  it('splits pool equally between 3 employees with rounding', () => {
    const result = calculateEqualSplit(1000, [
      { id: 'e1', name: 'Anna' },
      { id: 'e2', name: 'Björn' },
      { id: 'e3', name: 'Clara' },
    ])

    expect(result).toHaveLength(3)
    // 1000 / 3 = 333.333... -> rounded to 333.33
    expect(result[0].share).toBe(333.33)
    expect(result[1].share).toBe(333.33)
    expect(result[2].share).toBe(333.33)
  })

  it('returns empty array for no employees', () => {
    const result = calculateEqualSplit(1000, [])
    expect(result).toEqual([])
  })
})

describe('calculateHoursSplit', () => {
  it('distributes pool proportionally by hours worked', () => {
    const result = calculateHoursSplit(1200, [
      { id: 'e1', name: 'Anna', hours: 8 },
      { id: 'e2', name: 'Björn', hours: 4 },
    ])

    expect(result).toHaveLength(2)
    // Anna: 1200 * (8/12) = 800
    expect(result[0]).toEqual({ employeeId: 'e1', name: 'Anna', share: 800 })
    // Björn: 1200 * (4/12) = 400
    expect(result[1]).toEqual({ employeeId: 'e2', name: 'Björn', share: 400 })
  })

  it('returns zero shares when all employees have zero hours', () => {
    const result = calculateHoursSplit(1000, [
      { id: 'e1', name: 'Anna', hours: 0 },
      { id: 'e2', name: 'Björn', hours: 0 },
    ])

    expect(result).toHaveLength(2)
    expect(result[0].share).toBe(0)
    expect(result[1].share).toBe(0)
  })

  it('handles rounding correctly with uneven hours', () => {
    const result = calculateHoursSplit(1000, [
      { id: 'e1', name: 'Anna', hours: 7 },
      { id: 'e2', name: 'Björn', hours: 3 },
      { id: 'e3', name: 'Clara', hours: 5 },
    ])

    // Total hours: 15
    // Anna: 1000 * 7/15 = 466.666... -> 466.67
    expect(result[0].share).toBe(466.67)
    // Björn: 1000 * 3/15 = 200
    expect(result[1].share).toBe(200)
    // Clara: 1000 * 5/15 = 333.333... -> 333.33
    expect(result[2].share).toBe(333.33)
  })
})

describe('calculateCustomSplit', () => {
  it('distributes pool by custom percentages', () => {
    const result = calculateCustomSplit(2000, [
      { id: 'e1', name: 'Anna', pct: 50 },
      { id: 'e2', name: 'Björn', pct: 30 },
      { id: 'e3', name: 'Clara', pct: 20 },
    ])

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ employeeId: 'e1', name: 'Anna', share: 1000 })
    expect(result[1]).toEqual({ employeeId: 'e2', name: 'Björn', share: 600 })
    expect(result[2]).toEqual({ employeeId: 'e3', name: 'Clara', share: 400 })
  })

  it('handles rounding with fractional percentages', () => {
    const result = calculateCustomSplit(1000, [
      { id: 'e1', name: 'Anna', pct: 33.33 },
      { id: 'e2', name: 'Björn', pct: 33.33 },
      { id: 'e3', name: 'Clara', pct: 33.34 },
    ])

    // 1000 * 33.33 / 100 = 333.3 -> 333.3
    expect(result[0].share).toBe(333.3)
    expect(result[1].share).toBe(333.3)
    // 1000 * 33.34 / 100 = 333.4 -> 333.4
    expect(result[2].share).toBe(333.4)
  })
})

describe('calculateMonthlyTipTrend', () => {
  it('aggregates tips by month in chronological order', () => {
    const entries: TipEntry[] = [
      { date: '2025-03-05', shift: 'lunch', employeeId: 'e1', employeeName: 'Anna', amount: 200 },
      { date: '2025-01-10', shift: 'lunch', employeeId: 'e1', employeeName: 'Anna', amount: 300 },
      { date: '2025-01-15', shift: 'dinner', employeeId: 'e2', employeeName: 'Björn', amount: 500 },
      { date: '2025-02-10', shift: 'lunch', employeeId: 'e1', employeeName: 'Anna', amount: 400 },
      { date: '2025-03-10', shift: 'dinner', employeeId: 'e2', employeeName: 'Björn', amount: 350 },
    ]

    const result = calculateMonthlyTipTrend(entries)

    expect(result).toEqual([
      { month: '2025-01', total: 800 },
      { month: '2025-02', total: 400 },
      { month: '2025-03', total: 550 },
    ])
  })

  it('returns empty array for no entries', () => {
    const result = calculateMonthlyTipTrend([])
    expect(result).toEqual([])
  })
})
