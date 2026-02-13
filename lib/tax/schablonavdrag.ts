/**
 * Schablonavdrag (Standard Deductions) Calculator
 * Swedish tax deductions that don't require detailed receipts
 */

import type { SchablonavdragSettings, SchablonavdragSummary, MileageEntry } from '@/types'

// Housing types for hemmakontor deduction
export type HousingType = 'villa' | 'apartment' // villa = privatbostadsfastighet, apartment = hyresrätt/bostadsrätt

// Current Swedish schablonavdrag rates (2026)
export const SCHABLONAVDRAG_RATES = {
  hemmakontor: {
    // Different rates based on housing type
    villa: 2000, // 2,000 kr/year for villa/privatbostadsfastighet
    apartment: 4000, // 4,000 kr/year for hyresrätt/bostadsrätt
    min_hours_per_year: 800, // Minimum 800 hours working from home required
    description: 'Schablonavdrag för hemmakontor',
  },
  bil: {
    rate_per_mil: 25, // 25 kr per Swedish mile (10 km)
    rate_per_km: 2.5, // 2.50 kr per kilometer
    description: 'Schablonavdrag för bilkostnader (milersättning)',
  },
}

/**
 * Calculate hemmakontor (home office) deduction
 * Rate depends on housing type:
 * - Villa/privatbostadsfastighet: 2,000 kr/year
 * - Hyresrätt/Bostadsrätt: 4,000 kr/year
 * Prorated by months active
 */
export function calculateHemmakontorDeduction(
  monthsActive: number = 12,
  housingType: HousingType = 'apartment'
): number {
  const validMonths = Math.min(Math.max(monthsActive, 0), 12)
  const annualAmount = housingType === 'villa'
    ? SCHABLONAVDRAG_RATES.hemmakontor.villa
    : SCHABLONAVDRAG_RATES.hemmakontor.apartment
  return Math.round((annualAmount / 12) * validMonths)
}

/**
 * Calculate mileage deduction from total kilometers
 * Rate: 25 kr/mil = 2.50 kr/km
 */
export function calculateMileageDeduction(totalKm: number): number {
  if (totalKm <= 0) return 0
  // 2.50 kr per kilometer (25 kr per Swedish mile)
  return Math.round(totalKm * SCHABLONAVDRAG_RATES.bil.rate_per_km * 100) / 100
}

/**
 * Calculate mileage deduction from entries
 */
export function calculateMileageDeductionFromEntries(entries: MileageEntry[]): number {
  const totalKm = entries.reduce((sum, entry) => sum + Number(entry.distance_km), 0)
  return calculateMileageDeduction(totalKm)
}

/**
 * Get complete schablonavdrag summary for a user and year
 */
export function getSchablonavdragSummary(
  settings: SchablonavdragSettings | null,
  mileageEntries: MileageEntry[],
  year: number = new Date().getFullYear(),
  monthsInBusiness: number = 12
): SchablonavdragSummary {
  // Default settings if none provided
  const schablonavdragSettings: SchablonavdragSettings = settings || {
    hemmakontor_enabled: false,
    hemmakontor_housing_type: 'apartment',
    bil_enabled: false,
  }

  // Get housing type (default to apartment for higher deduction)
  const housingType: HousingType = schablonavdragSettings.hemmakontor_housing_type || 'apartment'

  // Calculate hemmakontor deduction based on housing type
  const hemmakontorDeduction = schablonavdragSettings.hemmakontor_enabled
    ? calculateHemmakontorDeduction(monthsInBusiness, housingType)
    : 0

  // Get the annual amount for this housing type
  const hemmakontorAnnualAmount = housingType === 'villa'
    ? SCHABLONAVDRAG_RATES.hemmakontor.villa
    : SCHABLONAVDRAG_RATES.hemmakontor.apartment

  // Filter entries for the specified year
  const yearEntries = mileageEntries.filter((entry) => {
    const entryYear = new Date(entry.date).getFullYear()
    return entryYear === year
  })

  // Calculate mileage totals
  const totalKm = yearEntries.reduce((sum, entry) => sum + Number(entry.distance_km), 0)
  const mileageDeduction = schablonavdragSettings.bil_enabled
    ? calculateMileageDeduction(totalKm)
    : 0

  return {
    year,
    hemmakontor: {
      enabled: schablonavdragSettings.hemmakontor_enabled,
      housing_type: housingType,
      months_active: monthsInBusiness,
      annual_amount: hemmakontorAnnualAmount,
      deduction: hemmakontorDeduction,
    },
    mileage: {
      enabled: schablonavdragSettings.bil_enabled,
      total_km: totalKm,
      rate_per_km: SCHABLONAVDRAG_RATES.bil.rate_per_km,
      total_deduction: mileageDeduction,
      entries_count: yearEntries.length,
    },
    total_deduction: hemmakontorDeduction + mileageDeduction,
  }
}

/**
 * Validate a mileage entry
 */
export function validateMileageEntry(entry: {
  date: string
  distance_km: number
  purpose: string
}): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check date
  if (!entry.date) {
    errors.push('Datum krävs')
  } else {
    const entryDate = new Date(entry.date)
    if (isNaN(entryDate.getTime())) {
      errors.push('Ogiltigt datum')
    } else if (entryDate > new Date()) {
      errors.push('Datum kan inte vara i framtiden')
    }
  }

  // Check distance
  if (!entry.distance_km || entry.distance_km <= 0) {
    errors.push('Avståndet måste vara större än 0 km')
  } else if (entry.distance_km > 10000) {
    errors.push('Orimligt avstånd (max 10 000 km per resa)')
  }

  // Check purpose
  if (!entry.purpose || entry.purpose.trim().length < 3) {
    errors.push('Ändamål krävs (minst 3 tecken)')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Get mileage entries grouped by month
 */
export function groupMileageEntriesByMonth(
  entries: MileageEntry[]
): Map<string, { entries: MileageEntry[]; totalKm: number; totalDeduction: number }> {
  const grouped = new Map<string, { entries: MileageEntry[]; totalKm: number; totalDeduction: number }>()

  for (const entry of entries) {
    const date = new Date(entry.date)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    if (!grouped.has(key)) {
      grouped.set(key, { entries: [], totalKm: 0, totalDeduction: 0 })
    }

    const group = grouped.get(key)!
    group.entries.push(entry)
    group.totalKm += Number(entry.distance_km)
    group.totalDeduction += Number(entry.total_deduction)
  }

  return grouped
}

/**
 * Format month key for display (Swedish)
 */
export function formatMonthKey(key: string): string {
  const [year, month] = key.split('-')
  const monthNames = [
    'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
    'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'
  ]
  return `${monthNames[parseInt(month) - 1]} ${year}`
}
