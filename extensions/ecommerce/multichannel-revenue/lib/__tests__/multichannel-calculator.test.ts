import { describe, it, expect } from 'vitest'
import {
  calculateChannelSummary,
  calculateOverallAOV,
  findDuplicate,
  calculateChannelGrowth,
  buildMonthlyComparison,
  filterEntriesByRange,
  type RevenueEntry,
} from '../multichannel-calculator'

describe('calculateChannelSummary', () => {
  it('groups entries by channel and calculates totals with AOV', () => {
    const entries: RevenueEntry[] = [
      { id: '1', month: '2025-01', channel: 'Shopify', revenue: 50000, orderCount: 200 },
      { id: '2', month: '2025-02', channel: 'Shopify', revenue: 60000, orderCount: 250 },
      { id: '3', month: '2025-01', channel: 'Amazon', revenue: 30000, orderCount: 150 },
      { id: '4', month: '2025-02', channel: 'Amazon', revenue: 35000, orderCount: 180 },
    ]

    const result = calculateChannelSummary(entries)

    expect(result).toHaveLength(2)

    const shopify = result.find(s => s.channel === 'Shopify')!
    expect(shopify.totalRevenue).toBe(110000)
    expect(shopify.totalOrders).toBe(450)
    // 110000 / 450 = 244.444... -> 244.44
    expect(shopify.aov).toBe(244.44)

    const amazon = result.find(s => s.channel === 'Amazon')!
    expect(amazon.totalRevenue).toBe(65000)
    expect(amazon.totalOrders).toBe(330)
    // 65000 / 330 = 196.969696... -> 196.97
    expect(amazon.aov).toBe(196.97)
  })

  it('returns AOV of 0 when a channel has zero orders', () => {
    const entries: RevenueEntry[] = [
      { id: '1', month: '2025-01', channel: 'Wholesale', revenue: 0, orderCount: 0 },
    ]

    const result = calculateChannelSummary(entries)

    expect(result).toHaveLength(1)
    expect(result[0].aov).toBe(0)
    expect(result[0].totalOrders).toBe(0)
  })
})

describe('calculateOverallAOV', () => {
  it('calculates overall AOV across all channels', () => {
    const entries: RevenueEntry[] = [
      { id: '1', month: '2025-01', channel: 'Shopify', revenue: 50000, orderCount: 200 },
      { id: '2', month: '2025-01', channel: 'Amazon', revenue: 30000, orderCount: 100 },
    ]

    // Total revenue: 80000, Total orders: 300
    // 80000 / 300 = 266.666... -> 266.67
    const result = calculateOverallAOV(entries)
    expect(result).toBe(266.67)
  })

  it('returns 0 for empty entries', () => {
    const result = calculateOverallAOV([])
    expect(result).toBe(0)
  })
})

describe('findDuplicate', () => {
  const entries: RevenueEntry[] = [
    { id: '1', month: '2025-01', channel: 'Shopify', revenue: 50000, orderCount: 200 },
    { id: '2', month: '2025-02', channel: 'Amazon', revenue: 30000, orderCount: 150 },
  ]

  it('finds an existing entry for same month and channel', () => {
    const dup = findDuplicate(entries, '2025-01', 'Shopify')
    expect(dup).toBeDefined()
    expect(dup!.id).toBe('1')
  })

  it('returns undefined when no duplicate exists', () => {
    const dup = findDuplicate(entries, '2025-03', 'Shopify')
    expect(dup).toBeUndefined()
  })
})

describe('calculateChannelGrowth', () => {
  it('calculates positive growth percentage', () => {
    const previous: RevenueEntry[] = [
      { id: '1', month: '2025-01', channel: 'Shopify', revenue: 40000, orderCount: 100 },
    ]
    const current: RevenueEntry[] = [
      { id: '2', month: '2025-02', channel: 'Shopify', revenue: 50000, orderCount: 120 },
    ]

    const result = calculateChannelGrowth(current, previous)

    expect(result).toHaveLength(1)
    expect(result[0].channel).toBe('Shopify')
    expect(result[0].currentRevenue).toBe(50000)
    expect(result[0].previousRevenue).toBe(40000)
    // (50000 - 40000) / 40000 * 100 = 25
    expect(result[0].growthPct).toBe(25)
  })

  it('calculates negative growth percentage', () => {
    const previous: RevenueEntry[] = [
      { id: '1', month: '2025-01', channel: 'Amazon', revenue: 60000, orderCount: 200 },
    ]
    const current: RevenueEntry[] = [
      { id: '2', month: '2025-02', channel: 'Amazon', revenue: 45000, orderCount: 150 },
    ]

    const result = calculateChannelGrowth(current, previous)

    expect(result).toHaveLength(1)
    expect(result[0].growthPct).toBe(-25)
  })

  it('returns null growthPct for new channel with no previous data', () => {
    const previous: RevenueEntry[] = [
      { id: '1', month: '2025-01', channel: 'Shopify', revenue: 40000, orderCount: 100 },
    ]
    const current: RevenueEntry[] = [
      { id: '2', month: '2025-02', channel: 'Shopify', revenue: 50000, orderCount: 120 },
      { id: '3', month: '2025-02', channel: 'TikTok Shop', revenue: 10000, orderCount: 50 },
    ]

    const result = calculateChannelGrowth(current, previous)

    const tiktok = result.find(r => r.channel === 'TikTok Shop')!
    expect(tiktok.currentRevenue).toBe(10000)
    expect(tiktok.previousRevenue).toBe(0)
    expect(tiktok.growthPct).toBeNull()
  })
})

describe('buildMonthlyComparison', () => {
  it('builds comparison table with 2 channels across 3 months', () => {
    const entries: RevenueEntry[] = [
      { id: '1', month: '2025-01', channel: 'Shopify', revenue: 50000, orderCount: 200 },
      { id: '2', month: '2025-01', channel: 'Amazon', revenue: 30000, orderCount: 100 },
      { id: '3', month: '2025-02', channel: 'Shopify', revenue: 55000, orderCount: 220 },
      { id: '4', month: '2025-02', channel: 'Amazon', revenue: 32000, orderCount: 110 },
      { id: '5', month: '2025-03', channel: 'Shopify', revenue: 60000, orderCount: 240 },
      { id: '6', month: '2025-03', channel: 'Amazon', revenue: 35000, orderCount: 130 },
    ]
    const channelNames = ['Shopify', 'Amazon']

    const result = buildMonthlyComparison(entries, channelNames)

    expect(result).toHaveLength(3)

    // Months should be sorted ascending
    expect(result[0].month).toBe('2025-01')
    expect(result[1].month).toBe('2025-02')
    expect(result[2].month).toBe('2025-03')

    // January
    expect(result[0].channels['Shopify']).toBe(50000)
    expect(result[0].channels['Amazon']).toBe(30000)
    expect(result[0].total).toBe(80000)

    // March
    expect(result[2].channels['Shopify']).toBe(60000)
    expect(result[2].channels['Amazon']).toBe(35000)
    expect(result[2].total).toBe(95000)
  })
})

describe('filterEntriesByRange', () => {
  it('filters entries by YYYY-MM date range inclusive', () => {
    const entries: RevenueEntry[] = [
      { id: '1', month: '2024-11', channel: 'Shopify', revenue: 40000, orderCount: 100 },
      { id: '2', month: '2024-12', channel: 'Shopify', revenue: 45000, orderCount: 110 },
      { id: '3', month: '2025-01', channel: 'Shopify', revenue: 50000, orderCount: 120 },
      { id: '4', month: '2025-02', channel: 'Shopify', revenue: 55000, orderCount: 130 },
      { id: '5', month: '2025-03', channel: 'Shopify', revenue: 60000, orderCount: 140 },
    ]

    const result = filterEntriesByRange(entries, '2024-12', '2025-02')

    expect(result).toHaveLength(3)
    expect(result.map(e => e.month)).toEqual(['2024-12', '2025-01', '2025-02'])
  })
})

describe('monetary rounding', () => {
  it('applies Math.round(x * 100) / 100 for all monetary outputs', () => {
    const entries: RevenueEntry[] = [
      { id: '1', month: '2025-01', channel: 'Shopify', revenue: 33333.33, orderCount: 7 },
      { id: '2', month: '2025-01', channel: 'Amazon', revenue: 16666.67, orderCount: 3 },
    ]

    // Overall AOV: 50000 / 10 = 5000
    expect(calculateOverallAOV(entries)).toBe(5000)

    // Per-channel AOV
    const summaries = calculateChannelSummary(entries)
    const shopify = summaries.find(s => s.channel === 'Shopify')!
    // 33333.33 / 7 = 4761.9042857... -> 4761.9
    expect(shopify.aov).toBe(4761.9)
    expect(shopify.totalRevenue).toBe(33333.33)

    const amazon = summaries.find(s => s.channel === 'Amazon')!
    // 16666.67 / 3 = 5555.5566... -> 5555.56
    expect(amazon.aov).toBe(5555.56)
    expect(amazon.totalRevenue).toBe(16666.67)
  })
})
