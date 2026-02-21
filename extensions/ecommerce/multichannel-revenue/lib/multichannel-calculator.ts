/**
 * Pure calculation functions for the Multichannel Revenue extension.
 *
 * Aggregates revenue data across sales channels (e.g. Shopify, Amazon,
 * physical store) and computes per-channel summaries, growth rates,
 * and monthly comparison tables.
 *
 * All monetary values use Math.round(x * 100) / 100 for precision.
 */

export interface RevenueEntry {
  id: string
  month: string   // YYYY-MM
  channel: string
  revenue: number
  orderCount: number
}

export interface ChannelSummary {
  channel: string
  totalRevenue: number
  totalOrders: number
  aov: number // revenue / orders, or 0
}

export interface ChannelGrowth {
  channel: string
  currentRevenue: number
  previousRevenue: number
  growthPct: number | null // null if no previous data
}

export interface MonthlyComparison {
  month: string
  channels: Record<string, number> // channel name -> revenue
  total: number
}

/**
 * Calculate per-channel summary with AOV (Average Order Value).
 * Groups entries by channel and computes totals.
 */
export function calculateChannelSummary(entries: RevenueEntry[]): ChannelSummary[] {
  const byChannel = new Map<string, { revenue: number; orders: number }>()

  for (const entry of entries) {
    const existing = byChannel.get(entry.channel)
    if (existing) {
      existing.revenue += entry.revenue
      existing.orders += entry.orderCount
    } else {
      byChannel.set(entry.channel, {
        revenue: entry.revenue,
        orders: entry.orderCount,
      })
    }
  }

  const summaries: ChannelSummary[] = []
  for (const [channel, data] of byChannel) {
    const totalRevenue = Math.round(data.revenue * 100) / 100
    const totalOrders = data.orders
    const aov = totalOrders > 0
      ? Math.round((totalRevenue / totalOrders) * 100) / 100
      : 0

    summaries.push({ channel, totalRevenue, totalOrders, aov })
  }

  return summaries
}

/**
 * Calculate overall AOV across all channels.
 * Returns 0 if there are no orders.
 */
export function calculateOverallAOV(entries: RevenueEntry[]): number {
  const totalRevenue = entries.reduce((sum, e) => sum + e.revenue, 0)
  const totalOrders = entries.reduce((sum, e) => sum + e.orderCount, 0)

  if (totalOrders === 0) return 0

  return Math.round((totalRevenue / totalOrders) * 100) / 100
}

/**
 * Check for duplicate entry (same month + channel).
 * Returns the first matching entry or undefined.
 */
export function findDuplicate(
  entries: RevenueEntry[],
  month: string,
  channel: string
): RevenueEntry | undefined {
  return entries.find(e => e.month === month && e.channel === channel)
}

/**
 * Calculate channel growth between current and previous period entries.
 * A channel present only in currentEntries gets growthPct: null.
 */
export function calculateChannelGrowth(
  currentEntries: RevenueEntry[],
  previousEntries: RevenueEntry[]
): ChannelGrowth[] {
  const currentByChannel = new Map<string, number>()
  for (const entry of currentEntries) {
    currentByChannel.set(
      entry.channel,
      (currentByChannel.get(entry.channel) ?? 0) + entry.revenue
    )
  }

  const previousByChannel = new Map<string, number>()
  for (const entry of previousEntries) {
    previousByChannel.set(
      entry.channel,
      (previousByChannel.get(entry.channel) ?? 0) + entry.revenue
    )
  }

  const results: ChannelGrowth[] = []
  for (const [channel, currentRevenue] of currentByChannel) {
    const rounded = Math.round(currentRevenue * 100) / 100
    const previousRevenue = previousByChannel.get(channel)

    if (previousRevenue === undefined || previousRevenue === 0) {
      results.push({
        channel,
        currentRevenue: rounded,
        previousRevenue: 0,
        growthPct: null,
      })
    } else {
      const prevRounded = Math.round(previousRevenue * 100) / 100
      const growthPct = Math.round(
        ((rounded - prevRounded) / prevRounded) * 10000
      ) / 100

      results.push({
        channel,
        currentRevenue: rounded,
        previousRevenue: prevRounded,
        growthPct,
      })
    }
  }

  return results
}

/**
 * Build monthly comparison table.
 * Each row contains per-channel revenue and a total for that month.
 * Months are sorted in ascending order.
 */
export function buildMonthlyComparison(
  entries: RevenueEntry[],
  channelNames: string[]
): MonthlyComparison[] {
  const monthMap = new Map<string, Record<string, number>>()

  for (const entry of entries) {
    if (!monthMap.has(entry.month)) {
      const channels: Record<string, number> = {}
      for (const name of channelNames) {
        channels[name] = 0
      }
      monthMap.set(entry.month, channels)
    }

    const channels = monthMap.get(entry.month)!
    channels[entry.channel] = Math.round(
      ((channels[entry.channel] ?? 0) + entry.revenue) * 100
    ) / 100
  }

  const months = Array.from(monthMap.keys()).sort()

  return months.map(month => {
    const channels = monthMap.get(month)!
    const total = Math.round(
      Object.values(channels).reduce((sum, v) => sum + v, 0) * 100
    ) / 100

    return { month, channels, total }
  })
}

/**
 * Filter entries by date range using the month field (YYYY-MM).
 * Inclusive on both ends: startDate <= month <= endDate.
 */
export function filterEntriesByRange(
  entries: RevenueEntry[],
  startDate: string,
  endDate: string
): RevenueEntry[] {
  return entries.filter(e => e.month >= startDate && e.month <= endDate)
}
