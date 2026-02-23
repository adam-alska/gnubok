/**
 * Supplier Matcher - Fuzzy matching between extracted invoice data and existing suppliers
 *
 * 4-pass matching algorithm:
 * 1. Exact org number match
 * 2. Exact VAT number match
 * 3. Bankgiro/plusgiro match
 * 4. Fuzzy name match (Levenshtein + Swedish suffix normalization)
 */

import type { Supplier } from '@/types'
import type { InvoiceExtractionResult, SupplierMatchResult } from '../types'

/**
 * Find the best matching supplier for extracted invoice data
 */
export function matchSupplier(
  extraction: InvoiceExtractionResult,
  suppliers: Supplier[]
): SupplierMatchResult | null {
  if (suppliers.length === 0) return null

  // Pass 1: Exact org number match
  if (extraction.supplier.orgNumber) {
    const normalizedOrg = normalizeOrgNumber(extraction.supplier.orgNumber)
    for (const supplier of suppliers) {
      if (supplier.org_number && normalizeOrgNumber(supplier.org_number) === normalizedOrg) {
        return {
          supplierId: supplier.id,
          supplierName: supplier.name,
          confidence: 0.98,
          matchMethod: 'org_number',
        }
      }
    }
  }

  // Pass 2: Exact VAT number match
  if (extraction.supplier.vatNumber) {
    const normalizedVat = normalizeVatNumber(extraction.supplier.vatNumber)
    for (const supplier of suppliers) {
      if (supplier.vat_number && normalizeVatNumber(supplier.vat_number) === normalizedVat) {
        return {
          supplierId: supplier.id,
          supplierName: supplier.name,
          confidence: 0.95,
          matchMethod: 'vat_number',
        }
      }
    }
  }

  // Pass 3: Bankgiro/plusgiro match
  if (extraction.supplier.bankgiro) {
    const normalizedBg = normalizeBankgiro(extraction.supplier.bankgiro)
    for (const supplier of suppliers) {
      if (supplier.bankgiro && normalizeBankgiro(supplier.bankgiro) === normalizedBg) {
        return {
          supplierId: supplier.id,
          supplierName: supplier.name,
          confidence: 0.92,
          matchMethod: 'bankgiro',
        }
      }
    }
  }
  if (extraction.supplier.plusgiro) {
    const normalizedPg = normalizeBankgiro(extraction.supplier.plusgiro)
    for (const supplier of suppliers) {
      if (supplier.plusgiro && normalizeBankgiro(supplier.plusgiro) === normalizedPg) {
        return {
          supplierId: supplier.id,
          supplierName: supplier.name,
          confidence: 0.92,
          matchMethod: 'bankgiro',
        }
      }
    }
  }

  // Pass 4: Fuzzy name match
  if (extraction.supplier.name) {
    let bestMatch: SupplierMatchResult | null = null

    for (const supplier of suppliers) {
      const similarity = calculateNameSimilarity(extraction.supplier.name, supplier.name)
      const confidence = Math.round(similarity * 0.85 * 100) / 100 // Cap at 0.85 for name matches

      if (confidence > 0.6 && (!bestMatch || confidence > bestMatch.confidence)) {
        bestMatch = {
          supplierId: supplier.id,
          supplierName: supplier.name,
          confidence,
          matchMethod: 'fuzzy_name',
        }
      }
    }

    return bestMatch
  }

  return null
}

/**
 * Normalize org number to digits only
 */
export function normalizeOrgNumber(orgNumber: string): string {
  return orgNumber.replace(/\D/g, '')
}

/**
 * Normalize VAT number to uppercase, no spaces
 */
export function normalizeVatNumber(vatNumber: string): string {
  return vatNumber.replace(/\s/g, '').toUpperCase()
}

/**
 * Normalize bankgiro/plusgiro to digits only
 */
export function normalizeBankgiro(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Calculate name similarity with Swedish company suffix normalization
 */
export function calculateNameSimilarity(name1: string, name2: string): number {
  if (!name1 || !name2) return 0

  const n1 = normalizeCompanyName(name1)
  const n2 = normalizeCompanyName(name2)

  if (n1 === n2) return 1

  if (n1.includes(n2) || n2.includes(n1)) return 0.9

  // Word overlap scoring
  const words1 = n1.split(/\s+/).filter(Boolean)
  const words2 = n2.split(/\s+/).filter(Boolean)
  const commonWords = words1.filter((w) => words2.includes(w))

  if (commonWords.length > 0) {
    const overlapScore = commonWords.length / Math.max(words1.length, words2.length)
    if (overlapScore >= 0.5) return 0.7 + overlapScore * 0.2
  }

  // Levenshtein similarity
  const distance = levenshteinDistance(n1, n2)
  const maxLength = Math.max(n1.length, n2.length)
  return maxLength > 0 ? 1 - distance / maxLength : 0
}

/**
 * Normalize Swedish company name for comparison.
 * Strips common legal suffixes and normalizes whitespace.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\såäöé]/g, '')
    .replace(
      /\b(ab|hb|kb|ek|ek\s*för|enskild\s*firma|aktiebolag|handelsbolag|kommanditbolag|ekonomisk\s*förening|stiftelse|ideell\s*förening|i\s*likvidation)\b/g,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length

  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }

  return dp[m][n]
}
