import { describe, it, expect } from 'vitest'
import {
  calculateOccupancyKPIs,
  validateOccupancyEntry,
  computePreviousPeriod,
  filterEntriesByRange,
  getOccupancyColor,
  type DailyOccupancyEntry,
} from '../occupancy-calculator'

describe('calculateOccupancyKPIs', () => {
  it('calculates basic occupancy percentage', () => {
    const entries: DailyOccupancyEntry[] = [
      { date: '2025-01-01', roomsOccupied: 80, roomsOutOfOrder: 2 },
      { date: '2025-01-02', roomsOccupied: 90, roomsOutOfOrder: 2 },
      { date: '2025-01-03', roomsOccupied: 70, roomsOutOfOrder: 3 },
    ]

    const result = calculateOccupancyKPIs(entries, 100)

    // totalOccupied = 240, totalCapacity = 300
    // 240 / 300 * 100 = 80
    expect(result.occupancyPct).toBe(80)
    expect(result.totalOccupied).toBe(240)
    expect(result.daysWithData).toBe(3)
  })

  it('calculates average occupied rooms', () => {
    const entries: DailyOccupancyEntry[] = [
      { date: '2025-01-01', roomsOccupied: 40, roomsOutOfOrder: 0 },
      { date: '2025-01-02', roomsOccupied: 50, roomsOutOfOrder: 0 },
      { date: '2025-01-03', roomsOccupied: 60, roomsOutOfOrder: 0 },
    ]

    const result = calculateOccupancyKPIs(entries, 100)

    // 150 / 3 = 50.0
    expect(result.avgOccupied).toBe(50)
  })

  it('calculates average out-of-order rooms with 1 decimal', () => {
    const entries: DailyOccupancyEntry[] = [
      { date: '2025-01-01', roomsOccupied: 50, roomsOutOfOrder: 3 },
      { date: '2025-01-02', roomsOccupied: 50, roomsOutOfOrder: 5 },
      { date: '2025-01-03', roomsOccupied: 50, roomsOutOfOrder: 2 },
    ]

    const result = calculateOccupancyKPIs(entries, 100)

    // totalOOO = 10, 10 / 3 = 3.333... -> 3.3
    expect(result.avgOutOfOrder).toBe(3.3)
    expect(result.totalOutOfOrder).toBe(10)
  })

  it('calculates average available rooms = totalRooms - occupied - OOO', () => {
    const entries: DailyOccupancyEntry[] = [
      { date: '2025-01-01', roomsOccupied: 60, roomsOutOfOrder: 5 },
      { date: '2025-01-02', roomsOccupied: 70, roomsOutOfOrder: 10 },
    ]

    const result = calculateOccupancyKPIs(entries, 100)

    // totalCapacity = 200, totalOccupied = 130, totalOOO = 15
    // available = (200 - 130 - 15) / 2 = 55 / 2 = 27.5
    expect(result.avgAvailable).toBe(27.5)
  })

  it('returns all zeros for empty entries', () => {
    const result = calculateOccupancyKPIs([], 100)

    expect(result.occupancyPct).toBe(0)
    expect(result.avgOccupied).toBe(0)
    expect(result.avgOutOfOrder).toBe(0)
    expect(result.avgAvailable).toBe(0)
    expect(result.totalOccupied).toBe(0)
    expect(result.totalOutOfOrder).toBe(0)
    expect(result.daysWithData).toBe(0)
  })

  it('handles rounding edge cases for percentages and averages', () => {
    const entries: DailyOccupancyEntry[] = [
      { date: '2025-01-01', roomsOccupied: 33, roomsOutOfOrder: 1 },
      { date: '2025-01-02', roomsOccupied: 33, roomsOutOfOrder: 1 },
      { date: '2025-01-03', roomsOccupied: 34, roomsOutOfOrder: 1 },
    ]

    const result = calculateOccupancyKPIs(entries, 100)

    // totalOccupied = 100, totalCapacity = 300
    // 100 / 300 * 100 = 33.333... -> Math.round(33.333... * 10000) / 100 = 33.33 (not 33.34)
    expect(result.occupancyPct).toBe(33.33)
    // avgOccupied = 100 / 3 = 33.333... -> Math.round(33.333... * 10) / 10 = 33.3
    expect(result.avgOccupied).toBe(33.3)
    // avgOOO = 3 / 3 = 1.0
    expect(result.avgOutOfOrder).toBe(1)
    // avgAvailable = (300 - 100 - 3) / 3 = 197 / 3 = 65.666... -> 65.7
    expect(result.avgAvailable).toBe(65.7)
  })
})

describe('validateOccupancyEntry', () => {
  it('returns null for a valid entry (occupied + OOO <= total)', () => {
    expect(validateOccupancyEntry(80, 10, 100)).toBeNull()
  })

  it('returns error when occupied + OOO exceeds total rooms', () => {
    const result = validateOccupancyEntry(90, 20, 100)
    expect(result).toBe('Occupied (90) + out of order (20) exceeds total rooms (100)')
  })

  it('returns null when both occupied and OOO are zero', () => {
    expect(validateOccupancyEntry(0, 0, 100)).toBeNull()
  })

  it('returns null when occupied + OOO exactly equals total rooms', () => {
    expect(validateOccupancyEntry(80, 20, 100)).toBeNull()
  })
})

describe('computePreviousPeriod', () => {
  it('computes previous period of the same length immediately before', () => {
    // 2025-01-11 to 2025-01-20 = 10 days
    const prev = computePreviousPeriod('2025-01-11', '2025-01-20')

    expect(prev.start).toBe('2025-01-01')
    expect(prev.end).toBe('2025-01-10')
  })

  it('handles month boundary crossing', () => {
    // 2025-02-01 to 2025-02-28 = 28 days
    const prev = computePreviousPeriod('2025-02-01', '2025-02-28')

    expect(prev.start).toBe('2025-01-04')
    expect(prev.end).toBe('2025-01-31')
  })
})

describe('filterEntriesByRange', () => {
  const entries: DailyOccupancyEntry[] = [
    { date: '2025-01-05', roomsOccupied: 50, roomsOutOfOrder: 2 },
    { date: '2025-01-10', roomsOccupied: 60, roomsOutOfOrder: 3 },
    { date: '2025-01-15', roomsOccupied: 70, roomsOutOfOrder: 1 },
    { date: '2025-01-20', roomsOccupied: 80, roomsOutOfOrder: 0 },
    { date: '2025-02-01', roomsOccupied: 90, roomsOutOfOrder: 5 },
  ]

  it('includes boundary dates and excludes out-of-range entries', () => {
    const filtered = filterEntriesByRange(entries, '2025-01-10', '2025-01-20')

    expect(filtered).toHaveLength(3)
    expect(filtered.map(e => e.date)).toEqual([
      '2025-01-10',
      '2025-01-15',
      '2025-01-20',
    ])
  })
})

describe('getOccupancyColor', () => {
  it('returns green for >= 80%', () => {
    expect(getOccupancyColor(80)).toBe('bg-green-500')
    expect(getOccupancyColor(100)).toBe('bg-green-500')
  })

  it('returns yellow for 50-79%', () => {
    expect(getOccupancyColor(50)).toBe('bg-yellow-500')
    expect(getOccupancyColor(79)).toBe('bg-yellow-500')
  })

  it('returns red for 1-49%', () => {
    expect(getOccupancyColor(1)).toBe('bg-red-500')
    expect(getOccupancyColor(49)).toBe('bg-red-500')
  })

  it('returns muted for 0%', () => {
    expect(getOccupancyColor(0)).toBe('bg-muted')
  })
})
