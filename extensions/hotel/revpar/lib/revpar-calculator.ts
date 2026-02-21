/**
 * Calculate RevPAR (Revenue Per Available Room) and related hotel KPIs.
 *
 * RevPAR = Total Room Revenue / Total Available Room-Nights
 * ADR    = Total Room Revenue / Total Rooms Sold
 * Occ%   = Total Rooms Sold / Total Available Room-Nights * 100
 *
 * Pure calculation functions — no side effects, no DB access.
 */

export interface DailyRevparEntry {
  date: string
  roomsSold: number
  roomRevenue: number
}

export interface RevparKPIs {
  revpar: number
  adr: number
  occupancyPct: number
  totalRevenue: number
  totalRoomsSold: number
  daysWithData: number
}

export interface MonthlyRevparTrend {
  month: string
  revpar: number
  adr: number
  occupancyPct: number
}

/**
 * Calculate RevPAR KPIs from daily entries.
 *
 * - revpar: totalRevenue / (totalRooms * daysWithData)
 * - adr: totalRevenue / totalRoomsSold
 * - occupancyPct: totalRoomsSold / (totalRooms * daysWithData) * 100
 */
export function calculateRevparKPIs(
  entries: DailyRevparEntry[],
  totalRooms: number
): RevparKPIs {
  if (totalRooms <= 0 || entries.length === 0) {
    return {
      revpar: 0,
      adr: 0,
      occupancyPct: 0,
      totalRevenue: 0,
      totalRoomsSold: 0,
      daysWithData: 0,
    }
  }

  const daysWithData = entries.length
  const totalRevenue = entries.reduce((sum, e) => sum + e.roomRevenue, 0)
  const totalRoomsSold = entries.reduce((sum, e) => sum + e.roomsSold, 0)

  const availableRoomNights = totalRooms * daysWithData

  const revpar = Math.round((totalRevenue / availableRoomNights) * 100) / 100
  const adr =
    totalRoomsSold > 0
      ? Math.round((totalRevenue / totalRoomsSold) * 100) / 100
      : 0
  const occupancyPct =
    Math.round((totalRoomsSold / availableRoomNights) * 10000) / 100

  return {
    revpar,
    adr,
    occupancyPct,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalRoomsSold,
    daysWithData,
  }
}

/**
 * Calculate monthly trend with RevPAR, ADR, and occupancy for each month.
 *
 * Groups entries by YYYY-MM and calculates KPIs per group.
 * Returns results sorted chronologically.
 */
export function calculateMonthlyRevparTrend(
  entries: DailyRevparEntry[],
  totalRooms: number
): MonthlyRevparTrend[] {
  if (totalRooms <= 0 || entries.length === 0) {
    return []
  }

  const byMonth = new Map<string, DailyRevparEntry[]>()

  for (const entry of entries) {
    const month = entry.date.slice(0, 7) // YYYY-MM
    const group = byMonth.get(month)
    if (group) {
      group.push(entry)
    } else {
      byMonth.set(month, [entry])
    }
  }

  const months = Array.from(byMonth.keys()).sort()

  return months.map((month) => {
    const monthEntries = byMonth.get(month)!
    const kpis = calculateRevparKPIs(monthEntries, totalRooms)
    return {
      month,
      revpar: kpis.revpar,
      adr: kpis.adr,
      occupancyPct: kpis.occupancyPct,
    }
  })
}

/**
 * Compute previous period date range of equal length, immediately before
 * the given range.
 *
 * For example, 2025-01-01 to 2025-01-31 (31 days) produces
 * 2024-12-01 to 2024-12-31.
 */
export function computePreviousPeriod(
  start: string,
  end: string
): { start: string; end: string } {
  const startDate = new Date(start + 'T00:00:00')
  const endDate = new Date(end + 'T00:00:00')

  const durationMs = endDate.getTime() - startDate.getTime()
  const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24))

  // Previous period ends the day before the current start
  const prevEnd = new Date(startDate.getTime())
  prevEnd.setDate(prevEnd.getDate() - 1)

  // Previous period starts (durationDays) days before prevEnd
  const prevStart = new Date(prevEnd.getTime())
  prevStart.setDate(prevStart.getDate() - durationDays)

  return {
    start: formatDate(prevStart),
    end: formatDate(prevEnd),
  }
}

/**
 * Filter entries to those whose date falls within [start, end] inclusive.
 */
export function filterEntriesByRange(
  entries: DailyRevparEntry[],
  start: string,
  end: string
): DailyRevparEntry[] {
  return entries.filter((e) => e.date >= start && e.date <= end)
}

function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
