/**
 * Pure calculation functions for hotel occupancy KPIs.
 *
 * Occupancy % = (totalOccupied / (totalRooms * days)) * 100
 *
 * All percentages use Math.round(x * 10000) / 100 (2 decimals).
 * All 1-decimal averages use Math.round(x * 10) / 10.
 */

export interface DailyOccupancyEntry {
  date: string
  roomsOccupied: number
  roomsOutOfOrder: number
  reason?: string
}

export interface OccupancyKPIs {
  /** totalOccupied / (totalRooms * days) * 100, rounded to 2 decimals */
  occupancyPct: number
  /** totalOccupied / days, rounded to 1 decimal */
  avgOccupied: number
  /** totalOOO / days, rounded to 1 decimal */
  avgOutOfOrder: number
  /** (totalRooms * days - occupied - OOO) / days, rounded to 1 decimal */
  avgAvailable: number
  totalOccupied: number
  totalOutOfOrder: number
  daysWithData: number
}

/**
 * Calculate occupancy KPIs from daily entries and total room count.
 * Returns all-zero KPIs when entries is empty or totalRooms is 0.
 */
export function calculateOccupancyKPIs(
  entries: DailyOccupancyEntry[],
  totalRooms: number
): OccupancyKPIs {
  const days = entries.length

  if (days === 0 || totalRooms <= 0) {
    return {
      occupancyPct: 0,
      avgOccupied: 0,
      avgOutOfOrder: 0,
      avgAvailable: 0,
      totalOccupied: 0,
      totalOutOfOrder: 0,
      daysWithData: 0,
    }
  }

  const totalOccupied = entries.reduce((sum, e) => sum + e.roomsOccupied, 0)
  const totalOutOfOrder = entries.reduce((sum, e) => sum + e.roomsOutOfOrder, 0)
  const totalCapacity = totalRooms * days

  const occupancyPct = Math.round((totalOccupied / totalCapacity) * 10000) / 100
  const avgOccupied = Math.round((totalOccupied / days) * 10) / 10
  const avgOutOfOrder = Math.round((totalOutOfOrder / days) * 10) / 10
  const avgAvailable =
    Math.round(((totalCapacity - totalOccupied - totalOutOfOrder) / days) * 10) / 10

  return {
    occupancyPct,
    avgOccupied,
    avgOutOfOrder,
    avgAvailable,
    totalOccupied,
    totalOutOfOrder,
    daysWithData: days,
  }
}

/**
 * Validate that occupied + outOfOrder does not exceed totalRooms.
 * Returns an error message string, or null if valid.
 */
export function validateOccupancyEntry(
  occupied: number,
  outOfOrder: number,
  totalRooms: number
): string | null {
  if (occupied < 0 || outOfOrder < 0) {
    return 'Values cannot be negative'
  }

  if (occupied + outOfOrder > totalRooms) {
    return `Occupied (${occupied}) + out of order (${outOfOrder}) exceeds total rooms (${totalRooms})`
  }

  return null
}

/**
 * Compute the previous period of the same length, immediately before
 * the given start date.
 *
 * For example, if start=2025-01-11 and end=2025-01-20 (10 days),
 * the previous period is 2025-01-01 to 2025-01-10.
 */
export function computePreviousPeriod(
  start: string,
  end: string
): { start: string; end: string } {
  const startDate = new Date(start + 'T00:00:00')
  const endDate = new Date(end + 'T00:00:00')

  // Duration in milliseconds (inclusive: add 1 day)
  const durationMs = endDate.getTime() - startDate.getTime() + 24 * 60 * 60 * 1000

  const prevEnd = new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
  const prevStart = new Date(prevEnd.getTime() - durationMs + 24 * 60 * 60 * 1000)

  return {
    start: formatDate(prevStart),
    end: formatDate(prevEnd),
  }
}

/**
 * Filter entries whose date falls within [start, end] inclusive.
 */
export function filterEntriesByRange(
  entries: DailyOccupancyEntry[],
  start: string,
  end: string
): DailyOccupancyEntry[] {
  return entries.filter((e) => e.date >= start && e.date <= end)
}

/**
 * Get a Tailwind color class for a calendar heatmap cell based on occupancy percentage.
 *
 * - >= 80%: green (high occupancy)
 * - 50-79%: yellow (moderate)
 * - 1-49%: red (low occupancy)
 * - 0%: muted (empty)
 */
export function getOccupancyColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 50) return 'bg-yellow-500'
  if (pct >= 1) return 'bg-red-500'
  return 'bg-muted'
}

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
