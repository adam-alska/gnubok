import { describe, it, expect } from 'vitest'
import {
  calculateUtilization,
  calculateProjectTimeStats,
  buildWeeklyGrid,
  calculateMonthlySummary,
  getEffectiveRate,
  type TimeEntry,
} from '../billable-hours-calculator'

describe('calculateUtilization', () => {
  it('calculates basic utilization KPIs', () => {
    const entries: TimeEntry[] = [
      { date: '2025-03-03', projectId: 'p1', hours: 6, billable: true },
      { date: '2025-03-03', projectId: 'p1', hours: 2, billable: false },
    ]

    const result = calculateUtilization(entries, 1000)

    expect(result.totalHours).toBe(8)
    expect(result.billableHours).toBe(6)
    expect(result.nonBillableHours).toBe(2)
    expect(result.utilization).toBe(75)
    expect(result.revenue).toBe(6000)
    expect(result.effectiveRate).toBe(750)
  })

  it('returns all zeros for empty entries', () => {
    const result = calculateUtilization([], 1500)

    expect(result.totalHours).toBe(0)
    expect(result.billableHours).toBe(0)
    expect(result.nonBillableHours).toBe(0)
    expect(result.utilization).toBe(0)
    expect(result.effectiveRate).toBe(0)
    expect(result.revenue).toBe(0)
  })

  it('returns 100% utilization when all hours are billable', () => {
    const entries: TimeEntry[] = [
      { date: '2025-03-03', projectId: 'p1', hours: 4, billable: true },
      { date: '2025-03-04', projectId: 'p2', hours: 4, billable: true },
    ]

    const result = calculateUtilization(entries, 800)

    expect(result.utilization).toBe(100)
    expect(result.billableHours).toBe(8)
    expect(result.nonBillableHours).toBe(0)
    expect(result.revenue).toBe(6400)
  })

  it('returns 0% utilization and zero revenue when all hours are non-billable', () => {
    const entries: TimeEntry[] = [
      { date: '2025-03-03', projectId: 'p1', hours: 3, billable: false },
      { date: '2025-03-04', projectId: 'p1', hours: 5, billable: false },
    ]

    const result = calculateUtilization(entries, 1200)

    expect(result.utilization).toBe(0)
    expect(result.billableHours).toBe(0)
    expect(result.nonBillableHours).toBe(8)
    expect(result.revenue).toBe(0)
    expect(result.effectiveRate).toBe(0)
  })

  it('calculates revenue as billable hours times rate', () => {
    const entries: TimeEntry[] = [
      { date: '2025-03-03', projectId: 'p1', hours: 10, billable: true },
      { date: '2025-03-04', projectId: 'p1', hours: 5, billable: false },
    ]

    const result = calculateUtilization(entries, 950)

    expect(result.revenue).toBe(9500)
    // effectiveRate = 9500 / 15 = 633.33
    expect(result.effectiveRate).toBe(633.33)
  })
})

describe('calculateProjectTimeStats', () => {
  it('calculates per-project stats for multiple projects', () => {
    const entries: TimeEntry[] = [
      { date: '2025-03-03', projectId: 'alpha', hours: 4, billable: true },
      { date: '2025-03-03', projectId: 'alpha', hours: 1, billable: false },
      { date: '2025-03-03', projectId: 'beta', hours: 3, billable: true },
      { date: '2025-03-04', projectId: 'beta', hours: 2, billable: true },
    ]

    const result = calculateProjectTimeStats(entries)

    expect(result).toHaveLength(2)

    const alpha = result.find(p => p.projectId === 'alpha')!
    expect(alpha.totalHours).toBe(5)
    expect(alpha.billableHours).toBe(4)
    expect(alpha.utilization).toBe(80)

    const beta = result.find(p => p.projectId === 'beta')!
    expect(beta.totalHours).toBe(5)
    expect(beta.billableHours).toBe(5)
    expect(beta.utilization).toBe(100)
  })

  it('returns empty array for empty entries', () => {
    const result = calculateProjectTimeStats([])
    expect(result).toEqual([])
  })
})

describe('buildWeeklyGrid', () => {
  const weekDates = [
    '2025-03-03', // Mon
    '2025-03-04', // Tue
    '2025-03-05', // Wed
    '2025-03-06', // Thu
    '2025-03-07', // Fri
    '2025-03-08', // Sat
    '2025-03-09', // Sun
  ]

  it('builds grid with entries on different days', () => {
    const entries: TimeEntry[] = [
      { date: '2025-03-03', projectId: 'p1', hours: 4, billable: true },
      { date: '2025-03-04', projectId: 'p1', hours: 6, billable: true },
      { date: '2025-03-03', projectId: 'p2', hours: 2, billable: true },
      { date: '2025-03-05', projectId: 'p2', hours: 3, billable: false },
    ]

    const result = buildWeeklyGrid(entries, weekDates, ['p1', 'p2'])

    expect(result.projects).toHaveLength(2)

    const p1 = result.projects.find(p => p.projectId === 'p1')!
    expect(p1.days).toEqual([4, 6, 0, 0, 0, 0, 0])

    const p2 = result.projects.find(p => p.projectId === 'p2')!
    expect(p2.days).toEqual([2, 0, 3, 0, 0, 0, 0])

    expect(result.dayTotals).toEqual([6, 6, 3, 0, 0, 0, 0])
  })

  it('returns zeros for an empty week', () => {
    const result = buildWeeklyGrid([], weekDates, ['p1'])

    expect(result.projects).toHaveLength(1)
    expect(result.projects[0].days).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(result.dayTotals).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
})

describe('calculateMonthlySummary', () => {
  it('groups entries into monthly summaries across two months', () => {
    const entries: TimeEntry[] = [
      { date: '2025-01-10', projectId: 'p1', hours: 40, billable: true },
      { date: '2025-01-15', projectId: 'p1', hours: 8, billable: false },
      { date: '2025-02-05', projectId: 'p1', hours: 32, billable: true },
      { date: '2025-02-10', projectId: 'p1', hours: 4, billable: false },
    ]

    const result = calculateMonthlySummary(entries, 1000)

    expect(result).toHaveLength(2)

    expect(result[0].month).toBe('2025-01')
    expect(result[0].billableHours).toBe(40)
    expect(result[0].nonBillableHours).toBe(8)
    expect(result[0].totalHours).toBe(48)
    expect(result[0].revenue).toBe(40000)

    expect(result[1].month).toBe('2025-02')
    expect(result[1].billableHours).toBe(32)
    expect(result[1].nonBillableHours).toBe(4)
    expect(result[1].totalHours).toBe(36)
    expect(result[1].revenue).toBe(32000)
  })

  it('returns empty array for no entries', () => {
    const result = calculateMonthlySummary([], 1000)
    expect(result).toEqual([])
  })
})

describe('getEffectiveRate', () => {
  it('returns project rate when defined', () => {
    expect(getEffectiveRate(1500, 1000)).toBe(1500)
  })

  it('falls back to global rate when project rate is undefined', () => {
    expect(getEffectiveRate(undefined, 1000)).toBe(1000)
  })
})
