/**
 * Validates fiscal period duration per BFL 3 kap.
 * Maximum 18 months for any fiscal period (first year may be extended).
 * Normal ongoing periods are 12 months.
 */

/**
 * Calculate the number of months between two dates (inclusive of partial months).
 * Assumes start is 1st of month and end is last of month.
 */
export function monthsBetween(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1
}

/**
 * Validate a fiscal period's duration and date constraints.
 * Returns null if valid, or an error message string if invalid.
 */
export function validatePeriodDuration(start: string, end: string): string | null {
  const startDate = new Date(start)
  const endDate = new Date(end)

  // end must be after start
  if (endDate <= startDate) {
    return 'Period end must be after period start'
  }

  // start must be 1st of month
  if (startDate.getDate() !== 1) {
    return 'Period start must be the 1st of a month'
  }

  // end must be last day of month
  const lastDayOfEndMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate()
  if (endDate.getDate() !== lastDayOfEndMonth) {
    return 'Period end must be the last day of a month'
  }

  // Max 18 months per BFL 3 kap.
  const months = monthsBetween(start, end)
  if (months > 18) {
    return `Period duration ${months} months exceeds maximum 18 months (BFL 3 kap.)`
  }

  return null
}
