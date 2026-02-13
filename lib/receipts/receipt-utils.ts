/**
 * Receipt utility functions (client-safe)
 *
 * These functions can be used in both client and server components.
 */

// Known Swedish merchants for special handling
export const SYSTEMBOLAGET_PATTERNS = [
  'systembolaget',
  'systemet',
  'bolaget',
]

export const RESTAURANT_MCC_CODES = [5812, 5813, 5814]

export const RESTAURANT_PATTERNS = [
  'restaurang',
  'restaurant',
  'café',
  'cafe',
  'bistro',
  'pizzeria',
  'sushi',
  'thai',
  'wok',
  'grill',
  'bar',
  'pub',
  'krog',
  'brasserie',
  'trattoria',
  'osteria',
  'matsal',
  'lunch',
  'middag',
]

/**
 * Check if a transaction MCC code indicates restaurant
 */
export function isRestaurantMCC(mccCode: number | null): boolean {
  if (!mccCode) return false
  return RESTAURANT_MCC_CODES.includes(mccCode)
}

/**
 * Calculate restaurant representation limits
 *
 * Swedish rules (2024):
 * - Max 60 kr/person för intern representation (lunch/middag)
 * - Max 180 kr/person för extern representation
 * - Max 180 kr/person för representationsgåvor
 *
 * For simplicity, we use 60 kr as the safe deductible limit per person
 */
export function calculateRepresentationLimits(
  totalAmount: number,
  persons: number
): {
  deductibleAmount: number
  nonDeductibleAmount: number
  perPersonAmount: number
  maxDeductiblePerPerson: number
} {
  const MAX_DEDUCTIBLE_PER_PERSON = 60

  const perPersonAmount = totalAmount / persons
  const deductiblePerPerson = Math.min(perPersonAmount, MAX_DEDUCTIBLE_PER_PERSON)
  const deductibleAmount = deductiblePerPerson * persons
  const nonDeductibleAmount = totalAmount - deductibleAmount

  return {
    deductibleAmount: Math.round(deductibleAmount * 100) / 100,
    nonDeductibleAmount: Math.round(nonDeductibleAmount * 100) / 100,
    perPersonAmount: Math.round(perPersonAmount * 100) / 100,
    maxDeductiblePerPerson: MAX_DEDUCTIBLE_PER_PERSON,
  }
}

/**
 * Detect if merchant is Systembolaget
 */
export function detectSystembolaget(merchantName: string): boolean {
  const name = merchantName.toLowerCase()
  return SYSTEMBOLAGET_PATTERNS.some((pattern) => name.includes(pattern))
}

/**
 * Detect if merchant is a restaurant
 */
export function detectRestaurant(merchantName: string): boolean {
  const name = merchantName.toLowerCase()
  return RESTAURANT_PATTERNS.some((pattern) => name.includes(pattern))
}
