/**
 * Account Mapping Engine
 *
 * Intelligently maps accounts from an imported SIE file to
 * the user's BAS chart of accounts. Uses multiple strategies:
 * 1. Exact account number match
 * 2. Account name similarity (Levenshtein distance)
 * 3. Account class consistency (5xxx → expense, etc.)
 * 4. User-defined overrides
 */

import type { BASAccount } from '@/types'
import type {
  SIEAccount,
  AccountMapping,
  AccountMatchType,
  SIEAccountMappingRecord,
} from './types'

/**
 * Calculate Levenshtein distance between two strings
 * Used for name similarity scoring
 */
function levenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase()
  const s2 = str2.toLowerCase()

  if (s1.length === 0) return s2.length
  if (s2.length === 0) return s1.length

  const matrix: number[][] = []

  // Initialize first column
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i]
  }

  // Initialize first row
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return matrix[s1.length][s2.length]
}

/**
 * Calculate similarity score between two strings (0-1)
 */
function nameSimilarity(name1: string, name2: string): number {
  if (!name1 || !name2) return 0

  const distance = levenshteinDistance(name1, name2)
  const maxLength = Math.max(name1.length, name2.length)

  if (maxLength === 0) return 1

  return 1 - distance / maxLength
}

/**
 * Normalize Swedish account names for better matching
 */
function normalizeAccountName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\wåäö\s]/gi, '') // Remove special chars except Swedish
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .trim()
}


/**
 * Get the account class (first digit) from an account number
 */
function getAccountClass(accountNumber: string): number {
  const firstDigit = accountNumber.charAt(0)
  return parseInt(firstDigit, 10) || 0
}

/**
 * Get the account group (first two digits) from an account number
 */
function getAccountGroup(accountNumber: string): string {
  return accountNumber.substring(0, 2)
}

/**
 * Check if two accounts are in compatible classes
 */
function areClassesCompatible(sourceNumber: string, targetNumber: string): boolean {
  const sourceClass = getAccountClass(sourceNumber)
  const targetClass = getAccountClass(targetNumber)

  // Same class is always compatible
  if (sourceClass === targetClass) return true

  // Allow some flexibility for related classes
  // 1xxx (assets) can map to 1xxx
  // 2xxx (equity/liabilities) can map to 2xxx
  // 3xxx (revenue) can map to 3xxx
  // 4xxx (cost of goods) can map to 4xxx or 5xxx
  // 5xxx (external expenses) can map to 5xxx or 6xxx
  // 6xxx (other external) can map to 6xxx or 5xxx
  // 7xxx (personnel) can map to 7xxx
  // 8xxx (financial) can map to 8xxx

  if (sourceClass === 4 && targetClass === 5) return true
  if (sourceClass === 5 && targetClass === 6) return true
  if (sourceClass === 6 && targetClass === 5) return true

  return false
}

/**
 * Find the best matching BAS account for a source account
 */
function findBestMatch(
  source: SIEAccount,
  basAccounts: BASAccount[],
  existingOverride?: AccountMapping
): AccountMapping | null {
  // If there's a user override, use it
  if (existingOverride) {
    return {
      ...existingOverride,
      isOverride: true,
    }
  }

  let bestMatch: BASAccount | null = null
  let bestScore = 0
  let matchType: AccountMatchType = 'class'

  for (const target of basAccounts) {
    // Strategy 1: Exact account number match
    if (source.number === target.account_number) {
      return {
        sourceAccount: source.number,
        sourceName: source.name,
        targetAccount: target.account_number,
        targetName: target.account_name,
        confidence: 1.0,
        matchType: 'exact',
        isOverride: false,
      }
    }

    // Strategy 2: Name similarity
    const nameSim = nameSimilarity(
      normalizeAccountName(source.name),
      normalizeAccountName(target.account_name)
    )

    // Strategy 3: Account class compatibility
    const classCompatible = areClassesCompatible(source.number, target.account_number)
    const sameGroup = getAccountGroup(source.number) === getAccountGroup(target.account_number)

    // Calculate combined score
    let score = 0

    // Name similarity is most important
    if (nameSim >= 0.9) {
      score = 0.9 + (nameSim - 0.9) // 0.9 - 1.0
    } else if (nameSim >= 0.7) {
      score = 0.7 + (nameSim - 0.7) * 0.5 // 0.7 - 0.85
    } else if (nameSim >= 0.5) {
      score = 0.5 + (nameSim - 0.5) * 0.25 // 0.5 - 0.575
    }

    // Boost for same account group (first 2 digits)
    if (sameGroup) {
      score += 0.2
    } else if (classCompatible) {
      score += 0.1
    }

    // Penalize cross-class mappings
    if (!classCompatible) {
      score *= 0.5
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = target
      matchType = nameSim >= 0.7 ? 'name' : 'class'
    }
  }

  if (!bestMatch || bestScore < 0.3) {
    return null
  }

  return {
    sourceAccount: source.number,
    sourceName: source.name,
    targetAccount: bestMatch.account_number,
    targetName: bestMatch.account_name,
    confidence: Math.min(bestScore, 1.0),
    matchType,
    isOverride: false,
  }
}

/**
 * Suggest mappings for all source accounts
 */
export function suggestMappings(
  sourceAccounts: SIEAccount[],
  basAccounts: BASAccount[],
  existingMappings?: SIEAccountMappingRecord[]
): AccountMapping[] {
  // Convert existing mappings to a lookup map
  const overrideMap = new Map<string, AccountMapping>()
  if (existingMappings) {
    for (const mapping of existingMappings) {
      const basAccount = basAccounts.find((a) => a.account_number === mapping.target_account)
      overrideMap.set(mapping.source_account, {
        sourceAccount: mapping.source_account,
        sourceName: mapping.source_name || '',
        targetAccount: mapping.target_account,
        targetName: basAccount?.account_name || mapping.target_account,
        confidence: mapping.confidence,
        matchType: mapping.match_type,
        isOverride: true,
      })
    }
  }

  const mappings: AccountMapping[] = []

  for (const source of sourceAccounts) {
    const existingOverride = overrideMap.get(source.number)
    const mapping = findBestMatch(source, basAccounts, existingOverride)

    if (mapping) {
      mappings.push(mapping)
    } else {
      // No match found - add with null target
      mappings.push({
        sourceAccount: source.number,
        sourceName: source.name,
        targetAccount: '',
        targetName: '',
        confidence: 0,
        matchType: 'manual',
        isOverride: false,
      })
    }
  }

  // Sort by confidence (low to high) so users see problematic mappings first
  mappings.sort((a, b) => a.confidence - b.confidence)

  return mappings
}

/**
 * Validate that all accounts are mapped
 */
export function validateMappings(mappings: AccountMapping[]): {
  valid: boolean
  unmappedAccounts: string[]
  lowConfidenceAccounts: string[]
} {
  const unmapped = mappings.filter((m) => !m.targetAccount)
  const lowConfidence = mappings.filter((m) => m.targetAccount && m.confidence < 0.5)

  return {
    valid: unmapped.length === 0,
    unmappedAccounts: unmapped.map((m) => m.sourceAccount),
    lowConfidenceAccounts: lowConfidence.map((m) => m.sourceAccount),
  }
}

/**
 * Get mapping statistics
 */
export function getMappingStats(mappings: AccountMapping[]): {
  total: number
  mapped: number
  unmapped: number
  exact: number
  name: number
  class: number
  manual: number
  lowConfidence: number
  averageConfidence: number
} {
  const total = mappings.length
  const mapped = mappings.filter((m) => m.targetAccount).length
  const unmapped = total - mapped

  const exact = mappings.filter((m) => m.matchType === 'exact').length
  const name = mappings.filter((m) => m.matchType === 'name').length
  const classMatch = mappings.filter((m) => m.matchType === 'class').length
  const manual = mappings.filter((m) => m.matchType === 'manual').length

  const lowConfidence = mappings.filter((m) => m.targetAccount && m.confidence < 0.5).length

  const confidenceSum = mappings
    .filter((m) => m.targetAccount)
    .reduce((sum, m) => sum + m.confidence, 0)
  const averageConfidence = mapped > 0 ? confidenceSum / mapped : 0

  return {
    total,
    mapped,
    unmapped,
    exact,
    name,
    class: classMatch,
    manual,
    lowConfidence,
    averageConfidence,
  }
}

/**
 * Apply a user override to the mappings
 */
export function applyMappingOverride(
  mappings: AccountMapping[],
  sourceAccount: string,
  targetAccount: string,
  targetName: string
): AccountMapping[] {
  return mappings.map((m) => {
    if (m.sourceAccount === sourceAccount) {
      return {
        ...m,
        targetAccount,
        targetName,
        confidence: 1.0,
        matchType: 'manual' as AccountMatchType,
        isOverride: true,
      }
    }
    return m
  })
}

/**
 * Convert mappings to a lookup map for quick access during import
 */
export function mappingsToMap(mappings: AccountMapping[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const mapping of mappings) {
    if (mapping.targetAccount) {
      map.set(mapping.sourceAccount, mapping.targetAccount)
    }
  }
  return map
}
