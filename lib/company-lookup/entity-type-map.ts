import type { EntityType } from '@/types'

/**
 * Map TIC / Bolagsverket `legalEntityType` strings onto gnubok's internal
 * EntityType union. Returns null for entity types gnubok does not (yet) support
 * end-to-end — callers should fall back to the manual onboarding wizard for
 * those (HB, KB, stiftelse, bostadsrättsförening, ...).
 */
export function mapEntityType(ticType: string | null | undefined): EntityType | null {
  if (!ticType) return null
  const lower = ticType.toLowerCase()
  if (lower === 'ab' || lower.includes('aktiebolag')) return 'aktiebolag'
  if (lower === 'ef' || lower.includes('enskild firma') || lower.includes('enskild')) return 'enskild_firma'
  return null
}
