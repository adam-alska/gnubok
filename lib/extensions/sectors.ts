import type { Sector, SectorSlug, ExtensionDefinition } from './types'
import { EXTENSION_DEFINITIONS } from './_generated/sector-definitions'

// ============================================================
// Sector & Extension Registry
// ============================================================
//
// Sector shells are structural and always present.
// Extension definitions per sector come from the generated file
// (controlled by extensions.config.json).
// ============================================================

/** Sector shells — structural metadata, always available */
const SECTOR_SHELLS: Omit<Sector, 'extensions'>[] = [
  {
    slug: 'general',
    name: 'Generella verktyg',
    icon: 'Layers',
    description: 'Verktyg som passar alla verksamheter',
  },
]

/** Full sectors with extensions merged from generated definitions */
export const SECTORS: Sector[] = SECTOR_SHELLS.map(shell => ({
  ...shell,
  extensions: EXTENSION_DEFINITIONS[shell.slug] ?? [],
}))

// ============================================================
// Helper functions
// ============================================================

export function getSector(slug: SectorSlug): Sector | undefined {
  return SECTORS.find(s => s.slug === slug)
}

export function getExtensionDefinition(sectorSlug: string, extensionSlug: string): ExtensionDefinition | undefined {
  const sector = SECTORS.find(s => s.slug === sectorSlug)
  return sector?.extensions.find(e => e.slug === extensionSlug)
}

export function getAllExtensions(): ExtensionDefinition[] {
  return SECTORS.flatMap(s => s.extensions)
}

export function getExtensionsBySector(slug: SectorSlug): ExtensionDefinition[] {
  return getSector(slug)?.extensions ?? []
}
