/**
 * Exclusivity Checker for Campaigns
 *
 * Detects conflicts between exclusivity periods.
 */

import type { Exclusivity, Campaign, ExclusivityConflict } from '@/types'

/**
 * Check if two date ranges overlap
 */
export function datesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  return start1 <= end2 && end1 >= start2
}

/**
 * Calculate the overlap period between two date ranges
 */
export function getOverlapPeriod(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): { start: string; end: string } | null {
  if (!datesOverlap(start1, end1, start2, end2)) {
    return null
  }

  return {
    start: start1 > start2 ? start1 : start2,
    end: end1 < end2 ? end1 : end2,
  }
}

/**
 * Find overlapping categories between two exclusivities
 * Case-insensitive comparison
 */
export function findOverlappingCategories(
  categories1: string[],
  categories2: string[]
): string[] {
  const normalized1 = categories1.map(c => c.toLowerCase())
  return categories2.filter(c => normalized1.includes(c.toLowerCase()))
}

/**
 * Check for conflicts between a new exclusivity and existing ones
 */
export function checkExclusivityConflicts(
  newExclusivity: {
    categories: string[]
    start_date: string
    end_date: string
  },
  existingExclusivities: (Exclusivity & { campaign?: Campaign })[]
): ExclusivityConflict[] {
  const conflicts: ExclusivityConflict[] = []

  for (const existing of existingExclusivities) {
    // Check if dates overlap
    if (!datesOverlap(
      newExclusivity.start_date,
      newExclusivity.end_date,
      existing.start_date,
      existing.end_date
    )) {
      continue
    }

    // Check if categories overlap
    const overlappingCategories = findOverlappingCategories(
      newExclusivity.categories,
      existing.categories
    )

    if (overlappingCategories.length === 0) {
      continue
    }

    // Calculate overlap period
    const overlap = getOverlapPeriod(
      newExclusivity.start_date,
      newExclusivity.end_date,
      existing.start_date,
      existing.end_date
    )

    if (overlap) {
      conflicts.push({
        existingExclusivity: existing,
        conflictingCampaign: existing.campaign!,
        overlappingCategories,
        overlapStart: overlap.start,
        overlapEnd: overlap.end,
      })
    }
  }

  return conflicts
}

/**
 * Get all active exclusivities for a user at a specific date
 */
export function getActiveExclusivities(
  exclusivities: Exclusivity[],
  date: string = new Date().toISOString().split('T')[0]
): Exclusivity[] {
  return exclusivities.filter(e =>
    e.start_date <= date && e.end_date >= date
  )
}

/**
 * Get all exclusivities that will be active in a date range
 */
export function getExclusivitiesInRange(
  exclusivities: Exclusivity[],
  startDate: string,
  endDate: string
): Exclusivity[] {
  return exclusivities.filter(e =>
    datesOverlap(e.start_date, e.end_date, startDate, endDate)
  )
}

/**
 * Check if a category is excluded at a specific date
 */
export function isCategoryExcluded(
  exclusivities: Exclusivity[],
  category: string,
  date: string = new Date().toISOString().split('T')[0]
): Exclusivity | null {
  const normalizedCategory = category.toLowerCase()

  for (const exclusivity of exclusivities) {
    if (exclusivity.start_date <= date && exclusivity.end_date >= date) {
      if (exclusivity.categories.some(c => c.toLowerCase() === normalizedCategory)) {
        return exclusivity
      }
    }
  }

  return null
}

/**
 * Check if a brand is excluded at a specific date
 */
export function isBrandExcluded(
  exclusivities: Exclusivity[],
  brand: string,
  date: string = new Date().toISOString().split('T')[0]
): Exclusivity | null {
  const normalizedBrand = brand.toLowerCase()

  for (const exclusivity of exclusivities) {
    if (exclusivity.start_date <= date && exclusivity.end_date >= date) {
      if (exclusivity.excluded_brands?.some(b => b.toLowerCase() === normalizedBrand)) {
        return exclusivity
      }
    }
  }

  return null
}

/**
 * Get a summary of current exclusivity commitments
 */
export function getExclusivitySummary(
  exclusivities: Exclusivity[]
): {
  active: Exclusivity[]
  upcoming: Exclusivity[]
  expired: Exclusivity[]
  allCategories: string[]
  allBrands: string[]
} {
  const today = new Date().toISOString().split('T')[0]

  const active = exclusivities.filter(e =>
    e.start_date <= today && e.end_date >= today
  )
  const upcoming = exclusivities.filter(e => e.start_date > today)
  const expired = exclusivities.filter(e => e.end_date < today)

  // Collect all unique categories from active exclusivities
  const allCategories = [...new Set(
    active.flatMap(e => e.categories)
  )]

  // Collect all unique brands from active exclusivities
  const allBrands = [...new Set(
    active.flatMap(e => e.excluded_brands || [])
  )]

  return {
    active,
    upcoming,
    expired,
    allCategories,
    allBrands,
  }
}
