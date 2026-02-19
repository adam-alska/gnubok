import type { Extension } from '@/lib/extensions/types'

/**
 * NE-bilaga Extension
 *
 * Generates NE-bilaga (Näringsverksamhet) for enskild firma.
 * Maps BAS account balances to NE declaration rutor (R1-R11)
 * for tax reporting to Skatteverket.
 *
 * Only relevant for EF entity type. Hidden for AB.
 */
export const neBilagaExtension: Extension = {
  id: 'ne-bilaga',
  name: 'NE-bilaga',
  version: '1.0.0',
  reportTypes: [
    {
      id: 'ne-bilaga',
      name: 'NE-bilaga',
      description: 'NE-bilaga (Näringsverksamhet) för enskild firma',
    },
  ],
}
