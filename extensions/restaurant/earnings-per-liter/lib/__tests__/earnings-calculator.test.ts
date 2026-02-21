import { describe, it, expect } from 'vitest'
import {
  calculateEarningsPerLiter,
  type LiterEntry,
} from '../earnings-calculator'

describe('calculateEarningsPerLiter', () => {
  const period = { start: '2025-01-01', end: '2025-01-31' }

  it('calculates earnings per liter correctly', () => {
    const entries: LiterEntry[] = [
      { date: '2025-01-05', liters: 50, type: 'wine' },
      { date: '2025-01-15', liters: 30, type: 'spirits' },
      { date: '2025-01-20', liters: 120, type: 'beer' },
    ]

    const result = calculateEarningsPerLiter(100000, entries, period.start, period.end)

    expect(result.totalRevenue).toBe(100000)
    expect(result.totalLiters).toBe(200)
    expect(result.earningsPerLiter).toBe(500)
    expect(result.period).toEqual(period)
  })

  it('returns 0 earnings per liter when no liters sold', () => {
    const entries: LiterEntry[] = []

    const result = calculateEarningsPerLiter(50000, entries, period.start, period.end)

    expect(result.totalRevenue).toBe(50000)
    expect(result.totalLiters).toBe(0)
    expect(result.earningsPerLiter).toBe(0)
  })

  it('filters entries by date range correctly', () => {
    const entries: LiterEntry[] = [
      { date: '2025-01-10', liters: 40, type: 'wine' },
      { date: '2025-02-15', liters: 999, type: 'beer' }, // Outside period
      { date: '2024-12-31', liters: 888, type: 'spirits' }, // Outside period
    ]

    const result = calculateEarningsPerLiter(20000, entries, period.start, period.end)

    expect(result.totalLiters).toBe(40)
    expect(result.earningsPerLiter).toBe(500)
  })

  it('handles monetary rounding correctly', () => {
    const entries: LiterEntry[] = [
      { date: '2025-01-10', liters: 3, type: 'spirits' },
    ]

    const result = calculateEarningsPerLiter(10000, entries, period.start, period.end)

    // 10000 / 3 = 3333.333... -> 3333.33
    expect(result.earningsPerLiter).toBe(3333.33)
  })

  it('handles liter rounding correctly', () => {
    const entries: LiterEntry[] = [
      { date: '2025-01-05', liters: 1.555, type: 'wine' },
      { date: '2025-01-10', liters: 2.777, type: 'beer' },
    ]

    const result = calculateEarningsPerLiter(5000, entries, period.start, period.end)

    // 1.555 + 2.777 = 4.332 -> rounded to 4.33
    expect(result.totalLiters).toBe(4.33)
  })

  it('includes boundary dates in the period', () => {
    const entries: LiterEntry[] = [
      { date: '2025-01-01', liters: 10, type: 'wine' },
      { date: '2025-01-31', liters: 20, type: 'beer' },
    ]

    const result = calculateEarningsPerLiter(9000, entries, period.start, period.end)

    expect(result.totalLiters).toBe(30)
    expect(result.earningsPerLiter).toBe(300)
  })
})
