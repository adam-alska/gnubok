/**
 * Receipt Analyzer — delegates to lib/ai/document-analyzer for extraction,
 * then applies receipt-specific validation and enhancement.
 *
 * SERVER-ONLY: uses the shared vision client via document-analyzer.
 */

import 'server-only'
import type { ReceiptExtractionResult } from '@/types'
import { extractReceipt } from '@/lib/ai/document-analyzer'
import {
  SYSTEMBOLAGET_PATTERNS,
  RESTAURANT_PATTERNS,
} from './receipt-utils'

// Re-export client-safe functions for convenience
export {
  calculateRepresentationLimits,
  isRestaurantMCC,
  detectSystembolaget,
  detectRestaurant,
} from './receipt-utils'

/**
 * Analyze a receipt image using Claude Haiku Vision.
 * Delegates extraction to the shared core, then applies receipt-specific enhancements.
 */
export async function analyzeReceipt(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' = 'image/jpeg'
): Promise<ReceiptExtractionResult> {
  const raw = await extractReceipt(imageBase64, mimeType)
  return validateAndEnhanceResult(raw)
}

/**
 * Receipt-specific validation and enhancement.
 * Applies Systembolaget/restaurant/foreign merchant detection
 * on top of the core extraction result.
 */
function validateAndEnhanceResult(result: ReceiptExtractionResult): ReceiptExtractionResult {
  // Detect special merchants using local patterns
  const merchantName = (result.merchant.name || '').toLowerCase()
  const isSystembolaget = result.flags.isSystembolaget || detectSystembolagetLocal(merchantName)
  const isRestaurant = result.flags.isRestaurant || detectRestaurantLocal(merchantName)
  const isForeign = result.flags.isForeignMerchant || detectForeignMerchant(result.merchant, result.receipt.currency)

  return {
    ...result,
    merchant: {
      ...result.merchant,
      isForeign,
    },
    flags: {
      isRestaurant,
      isSystembolaget,
      isForeignMerchant: isForeign,
    },
  }
}

/**
 * Detect if merchant is Systembolaget (local version using imported patterns)
 */
function detectSystembolagetLocal(merchantName: string): boolean {
  return SYSTEMBOLAGET_PATTERNS.some((pattern) => merchantName.includes(pattern))
}

/**
 * Detect if merchant is a restaurant (local version using imported patterns)
 */
function detectRestaurantLocal(merchantName: string): boolean {
  return RESTAURANT_PATTERNS.some((pattern) => merchantName.includes(pattern))
}

/**
 * Detect if merchant is foreign (non-Swedish)
 */
function detectForeignMerchant(
  merchant: ReceiptExtractionResult['merchant'],
  currency?: string
): boolean {
  if (currency && currency !== 'SEK') return true

  const orgNumber = merchant.orgNumber || ''
  if (orgNumber) {
    const digits = orgNumber.replace(/\D/g, '')
    if (digits.length !== 10) return true
  }

  const vatNumber = merchant.vatNumber || ''
  if (vatNumber && !vatNumber.toUpperCase().startsWith('SE')) return true

  return false
}
