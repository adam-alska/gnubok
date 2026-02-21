/**
 * Account Mapping Engine
 *
 * Maps accounts from an imported SIE file to the user's BAS chart of accounts.
 * Uses exact account number matching only — no fuzzy/heuristic matching.
 * This aligns with Swedish industry standard (e.g. Fortnox): exact match,
 * create new, or let the user map manually.
 */

import type { BASAccount } from '@/types'
import type {
  SIEAccount,
  AccountMapping,
  AccountMatchType,
  SIEAccountMappingRecord,
} from './types'

/**
 * Find the best matching BAS account for a source account.
 * Only matches on exact account number — no fuzzy matching.
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

  // Exact account number match
  const exactMatch = basAccounts.find(
    (target) => source.number === target.account_number
  )

  if (exactMatch) {
    return {
      sourceAccount: source.number,
      sourceName: source.name,
      targetAccount: exactMatch.account_number,
      targetName: exactMatch.account_name,
      confidence: 1.0,
      matchType: 'exact',
      isOverride: false,
    }
  }

  // No match found
  return null
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
