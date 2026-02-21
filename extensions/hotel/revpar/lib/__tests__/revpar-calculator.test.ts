import { describe, it, expect } from 'vitest'
import {
  calculateRevparKPIs,
  calculateMonthlyRevparTrend,
  computePreviousPeriod,
  filterEntriesByRange,
  type DailyRevparEntry,
} from '../revpar-calculator'

describe('calculateRevparKPIs', () => {
  it('calculates basic RevPAR correctly', () => {
    const entries: DailyRevparEntry[] = [
      { date: '2025-01-01', roomsSold: 80, roomRevenue: 120000 },
      { date: '2025-01-02', roomsSold: 90, roomRevenue: 135000 },
    ]

    const result = calculateRevparKPIs(entries, 100)

    // totalRevenue = 255000, availableRoomNights = 100 * 2 = 200
    // revpar = 255000 / 200 = 1275
    expect(result.revpar).toBe(1275)
    expect(result.totalRevenue).toBe(255000)
    expect(result.daysWithData).toBe(2)
  })

  it('calculates ADR as revenue divided by rooms sold', () => {
    const entries: DailyRevparEntry[] = [
      { date: '2025-01-01', roomsSold: 50, roomRevenue: 75000 },
      { date: '2025-01-02', roomsSold: 60, roomRevenue: 96000 },
    ]

    const result = calculateRevparKPIs(entries, 100)

    // totalRevenue = 171000, totalRoomsSold = 110
    // adr = 171000 / 110 = 1554.545454... -> 1554.55
    expect(result.adr).toBe(1554.55)
    expect(result.totalRoomsSold).toBe(110)
  })

  it('calculates occupancy percentage', () => {
    const entries: DailyRevparEntry[] = [
      { date: '2025-01-01', roomsSold: 75, roomRevenue: 100000 },
      { date: '2025-01-02', roomsSold: 85, roomRevenue: 110000 },
      { date: '2025-01-03', roomsSold: 80, roomRevenue: 105000 },
    ]

    const result = calculateRevparKPIs(entries, 100)

    // totalRoomsSold = 240, availableRoomNights = 100 * 3 = 300
    // occupancyPct = (240 / 300) * 100 = 80.00
    expect(result.occupancyPct).toBe(80)
  })

  it('returns ADR = 0 when zero rooms sold', () => {
    const entries: DailyRevparEntry[] = [
      { date: '2025-01-01', roomsSold: 0, roomRevenue: 0 },
      { date: '2025-01-02', roomsSold: 0, roomRevenue: 0 },
    ]

    const result = calculateRevparKPIs(entries, 100)

    expect(result.adr).toBe(0)
    expect(result.revpar).toBe(0)
    expect(result.occupancyPct).toBe(0)
    expect(result.totalRoomsSold).toBe(0)
  })

  it('returns all zeros when totalRooms is zero', () => {
    const entries: DailyRevparEntry[] = [
      { date: '2025-01-01', roomsSold: 50, roomRevenue: 75000 },
    ]

    const result = calculateRevparKPIs(entries, 0)

    expect(result.revpar).toBe(0)
    expect(result.adr).toBe(0)
    expect(result.occupancyPct).toBe(0)
    expect(result.totalRevenue).toBe(0)
    expect(result.totalRoomsSold).toBe(0)
    expect(result.daysWithData).toBe(0)
  })

  it('returns all zeros for empty entries', () => {
    const result = calculateRevparKPIs([], 100)

    expect(result.revpar).toBe(0)
    expect(result.adr).toBe(0)
    expect(result.occupancyPct).toBe(0)
    expect(result.totalRevenue).toBe(0)
    expect(result.totalRoomsSold).toBe(0)
    expect(result.daysWithData).toBe(0)
  })

  it('rounds monetary values correctly', () => {
    const entries: DailyRevparEntry[] = [
      { date: '2025-01-01', roomsSold: 33, roomRevenue: 49999.99 },
      { date: '2025-01-02', roomsSold: 33, roomRevenue: 49999.99 },
      { date: '2025-01-03', roomsSold: 33, roomRevenue: 49999.99 },
    ]

    const result = calculateRevparKPIs(entries, 50)

    // totalRevenue = 149999.97, availableRoomNights = 50 * 3 = 150
    // revpar = 149999.97 / 150 = 999.9998 -> 1000.00
    expect(result.revpar).toBe(1000)
    expect(result.totalRevenue).toBe(149999.97)

    // adr = 149999.97 / 99 = 1515.1512... -> 1515.15
    expect(result.adr).toBe(1515.15)

    // occupancyPct = (99 / 150) * 100 = 66.00
    expect(result.occupancyPct).toBe(66)
  })
})

describe('calculateMonthlyRevparTrend', () => {
  it('groups entries by month and calculates per-month KPIs', () => {
    const entries: DailyRevparEntry[] = [
      { date: '2025-01-05', roomsSold: 80, roomRevenue: 100000 },
      { date: '2025-01-15', roomsSold: 90, roomRevenue: 120000 },
      { date: '2025-02-10', roomsSold: 70, roomRevenue: 85000 },
      { date: '2025-03-20', roomsSold: 95, roomRevenue: 140000 },
    ]

    const trend = calculateMonthlyRevparTrend(entries, 100)

    expect(trend).toHaveLength(3)
    expect(trend[0].month).toBe('2025-01')
    expect(trend[1].month).toBe('2025-02')
    expect(trend[2].month).toBe('2025-03')

    // January: revenue = 220000, rooms sold = 170, days = 2, available = 200
    // revpar = 220000 / 200 = 1100
    expect(trend[0].revpar).toBe(1100)
    // adr = 220000 / 170 = 1294.117647... -> 1294.12
    expect(trend[0].adr).toBe(1294.12)
    // occupancyPct = (170 / 200) * 100 = 85.00
    expect(trend[0].occupancyPct).toBe(85)

    // February: revenue = 85000, rooms sold = 70, days = 1, available = 100
    expect(trend[1].revpar).toBe(850)
    // adr = 85000 / 70 = 1214.285714... -> 1214.29
    expect(trend[1].adr).toBe(1214.29)
    expect(trend[1].occupancyPct).toBe(70)

    // March: revenue = 140000, rooms sold = 95, days = 1, available = 100
    expect(trend[2].revpar).toBe(1400)
    // adr = 140000 / 95 = 1473.684210... -> 1473.68
    expect(trend[2].adr).toBe(1473.68)
    expect(trend[2].occupancyPct).toBe(95)
  })

  it('returns empty array for empty entries', () => {
    expect(calculateMonthlyRevparTrend([], 100)).toEqual([])
  })

  it('returns empty array when totalRooms is zero', () => {
    const entries: DailyRevparEntry[] = [
      { date: '2025-01-01', roomsSold: 50, roomRevenue: 75000 },
    ]
    expect(calculateMonthlyRevparTrend(entries, 0)).toEqual([])
  })
})

describe('computePreviousPeriod', () => {
  it('computes previous period for January (wraps to previous year)', () => {
    const prev = computePreviousPeriod('2025-01-01', '2025-01-31')

    // 31 days in range. Previous period ends 2024-12-31, starts 2024-12-01.
    expect(prev.start).toBe('2024-12-01')
    expect(prev.end).toBe('2024-12-31')
  })

  it('computes previous period for same-month range', () => {
    const prev = computePreviousPeriod('2025-06-01', '2025-06-30')

    // June 1-30 = 30 days inclusive (29-day span).
    // Previous ends May 31, starts May 31 - 29 = May 2.
    // May 2-31 = 30 days inclusive — same length.
    expect(prev.start).toBe('2025-05-02')
    expect(prev.end).toBe('2025-05-31')
  })

  it('computes previous period for a 7-day range', () => {
    const prev = computePreviousPeriod('2025-03-10', '2025-03-16')

    // March 10-16 = 7 days inclusive (6-day span).
    // Previous ends March 9, starts March 9 - 6 = March 3.
    // March 3-9 = 7 days inclusive — same length.
    expect(prev.start).toBe('2025-03-03')
    expect(prev.end).toBe('2025-03-09')
  })
})

describe('filterEntriesByRange', () => {
  const entries: DailyRevparEntry[] = [
    { date: '2025-01-01', roomsSold: 80, roomRevenue: 100000 },
    { date: '2025-01-15', roomsSold: 90, roomRevenue: 120000 },
    { date: '2025-01-31', roomsSold: 85, roomRevenue: 110000 },
    { date: '2025-02-01', roomsSold: 70, roomRevenue: 85000 },
    { date: '2025-02-15', roomsSold: 75, roomRevenue: 95000 },
  ]

  it('filters entries within date range inclusive', () => {
    const filtered = filterEntriesByRange(entries, '2025-01-01', '2025-01-31')

    expect(filtered).toHaveLength(3)
    expect(filtered.map(e => e.date)).toEqual([
      '2025-01-01',
      '2025-01-15',
      '2025-01-31',
    ])
  })

  it('excludes entries outside the range', () => {
    const filtered = filterEntriesByRange(entries, '2025-02-01', '2025-02-28')

    expect(filtered).toHaveLength(2)
    expect(filtered.map(e => e.date)).toEqual(['2025-02-01', '2025-02-15'])
  })

  it('returns empty array when no entries match', () => {
    const filtered = filterEntriesByRange(entries, '2025-06-01', '2025-06-30')

    expect(filtered).toHaveLength(0)
  })
})
